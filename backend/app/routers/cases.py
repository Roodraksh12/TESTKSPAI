from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.deps import get_current_user
from app.services.parallel import invalidate_all
from app.services import deadline_engine, final_reports, geocoder, intake_intel
from app.services.hierarchy import has_wide_case_scope
from app.services.case_access import (
    create_audit_log,
    get_case_with_relations,
    jurisdiction_filter_sql,
    jurisdiction_station_filter_sql,
    require_case_write,
)
from app.services.db import (
    execute,
    execute_returning,
    fetch_all,
    fetch_one,
    fetch_scalar,
    new_id,
    run_on_connection,
    serialize_rows,
)
from app.services.custody_clocks import list_case_clocks
from app.services.warning_engine import refresh_hotspot_warnings

router = APIRouter(prefix="/api/cases", tags=["cases"])


class CreateCaseRequest(BaseModel):
    accusedNames: list[str] = Field(default_factory=list)
    victimName: str | None = None
    incidentDate: str | None = None
    crimeType: str | None = None
    narrativeSummary: str | None = None
    summary: str | None = None
    modusOperandi: str | None = None
    rawText: str | None = None
    location: str | None = None
    stationId: str | None = None
    possibleMatches: list[dict] = Field(default_factory=list)


class DraftRequest(BaseModel):
    audience: str = "IO"


class MatchUpdateRequest(BaseModel):
    matchId: str
    status: str


class ChargesheetUpdateRequest(BaseModel):
    """Body for saving an edited charge-sheet draft.

    Was referenced by the PUT handler but never declared, so every save was
    rejected with a 422 before reaching the database.
    """

    chargesheetDraft: str


class CustodyClockRequest(BaseModel):
    """A court-remand record, not a suspect-identification or arrest record."""

    casePersonId: str = Field(min_length=1, max_length=100)
    newAccusedName: str | None = Field(default=None, max_length=200)
    firstRemandAt: datetime
    windowDays: Literal[60, 90]
    thresholdBasis: Literal["DEATH_LIFE_OR_TEN_YEARS_OR_MORE", "OTHER_OFFENCE"]
    legalSectionDetails: str = Field(min_length=2, max_length=1_000)
    remandOrderReference: str = Field(min_length=2, max_length=500)
    notes: str | None = Field(default=None, max_length=2_000)
    acknowledgeFirstRemand: bool

    @model_validator(mode="after")
    def window_matches_statutory_basis(self):
        expected_window = 90 if self.thresholdBasis == "DEATH_LIFE_OR_TEN_YEARS_OR_MORE" else 60
        if self.windowDays != expected_window:
            raise ValueError("The selected 60/90-day window does not match the stated statutory basis")
        if not self.acknowledgeFirstRemand:
            raise ValueError("Confirm that this is the first Magistrate-authorised remand for this FIR")
        return self


class CustodyClockFilingRequest(BaseModel):
    filedAt: datetime
    reportReference: str = Field(min_length=2, max_length=500)


def _utc_storage_timestamp(value: datetime | str) -> datetime:
    """Keep timestamp-without-time-zone legacy columns as UTC wall timestamps."""
    if not isinstance(value, datetime):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).replace(tzinfo=None)
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _require_assigned_io(case_data: dict, officer: dict) -> None:
    assigned_io_id = case_data.get("currentIoId")
    if assigned_io_id and assigned_io_id != officer.get("id"):
        raise HTTPException(status_code=403, detail="Only the assigned investigating officer can record custody clocks")


def _display_date(value: object) -> str:
    """Return a stable date label for serialized DB timestamps."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = str(value or "")
    return text[:10] if len(text) >= 10 else text or "Unknown date"


def _find_or_create_person(name: str, role: str) -> dict:
    person = fetch_one(
        'SELECT * FROM "Person" WHERE LOWER(name) = LOWER(%(name)s) LIMIT 1',
        {"name": name},
    )
    if person:
        return person
    return execute_returning(
        '''
        INSERT INTO "Person" (id, name, role)
        VALUES (%(id)s, %(name)s, %(role)s)
        RETURNING *
        ''',
        {"id": new_id(), "name": name, "role": role},
    ) or {}


@router.get("")
def list_cases(
    crimeType: str | None = None,
    stationId: str | None = None,
    status: str | None = None,
    date: str | None = None,
    q: str | None = None,
    hasPendingMatches: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = current_user["officer"]
    wide_scope = has_wide_case_scope(officer.get("role"))
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    params: dict = {**scope_params}
    filters = ""

    if crimeType and crimeType not in ("All Crimes", "all"):
        filters += ' AND c."crimeType" = %(crimeType)s'
        params["crimeType"] = crimeType

    if stationId and stationId != "all" and wide_scope:
        filters += ' AND c."stationId" = %(filterStationId)s'
        params["filterStationId"] = stationId

    if status and status not in ("All Statuses", "all"):
        filters += ' AND c.status = %(status)s'
        params["status"] = status

    if date and date != "all":
        if date == "today":
            filters += ' AND c."reportedDate" >= date_trunc(\'day\', NOW())'
        elif date == "week":
            filters += ' AND c."reportedDate" >= NOW() - INTERVAL \'7 days\''
        elif date == "month":
            filters += ' AND c."reportedDate" >= NOW() - INTERVAL \'1 month\''

    if q and q.strip():
        filters += '''
            AND (
                c."firNumber" ILIKE %(q)s
                OR COALESCE(c.summary, '') ILIKE %(q)s
                OR c."crimeType" ILIKE %(q)s
            )
        '''
        params["q"] = f"%{q.strip()}%"

    if hasPendingMatches == "true":
        filters += ' AND EXISTS (SELECT 1 FROM "CaseMatch" cm WHERE cm."caseId" = c.id AND cm.status = \'PENDING\')'

    def _load(conn):
        with conn.cursor() as cur:
            cur.execute(
                f'''
                SELECT
                    c.id, c."firNumber", c."stationId", c."crimeType", c.status,
                    c."incidentDate", c."reportedDate", c.summary, c."createdFromScan",
                    ps.name AS "stationName"
                FROM "Case" c
                LEFT JOIN "PoliceStation" ps ON c."stationId" = ps.id
                WHERE 1=1{scope_sql}{filters}
                ORDER BY c."reportedDate" DESC
                LIMIT 100
                ''',
                params,
            )
            cases = serialize_rows(cur.fetchall())

            station_scope_sql, station_scope_params = jurisdiction_station_filter_sql(officer, alias="ps")
            cur.execute(
                f'''
                SELECT ps.id, ps.name
                FROM "PoliceStation" ps
                WHERE 1=1{station_scope_sql}
                ORDER BY ps.name
                ''',
                station_scope_params,
            )
            stations = serialize_rows(cur.fetchall())
            return cases, stations

    cases, stations = run_on_connection(_load)
    for case in cases:
        case["station"] = case.pop("stationName", None) or "Station"
    return {"cases": cases, "stations": stations}


@router.post("")
def create_case(payload: CreateCaseRequest, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    require_case_write(officer)
    station_id = officer.get("stationId") or payload.stationId
    if not station_id:
        raise HTTPException(
            status_code=400,
            detail="stationId is required when your account is not assigned to a station",
        )
    year = datetime.now(timezone.utc).year
    count = fetch_scalar(
        'SELECT COUNT(*) FROM "Case" WHERE "stationId" = %(stationId)s',
        {"stationId": station_id},
    ) or 0
    fir_number = f"FIR/{year}/{int(count) + 1:04d}"

    incident_date = datetime.now(timezone.utc)
    if payload.incidentDate and payload.incidentDate != "Unknown":
        try:
            incident_date = datetime.fromisoformat(payload.incidentDate.replace("Z", "+00:00"))
        except ValueError:
            pass

    narrative = payload.narrativeSummary or payload.summary or ""
    summary = intake_intel.pack_summary_with_mo(narrative, payload.modusOperandi)
    latitude, longitude = geocoder.geocode_location(payload.location, officer.get("stationName"))

    case_row = execute_returning(
        '''
        INSERT INTO "Case" (
            id, "firNumber", "stationId", "crimeType", status, "incidentDate",
            summary, "rawExtractedText", "createdFromScan", latitude, longitude
        )
        VALUES (
            %(id)s, %(firNumber)s, %(stationId)s, %(crimeType)s, 'OPEN', %(incidentDate)s,
            %(summary)s, %(rawText)s, %(createdFromScan)s, %(latitude)s, %(longitude)s
        )
        RETURNING *
        ''',
        {
            "id": new_id(),
            "firNumber": fir_number,
            "stationId": station_id,
            "crimeType": payload.crimeType or "Unknown",
            "incidentDate": incident_date,
            "summary": summary or None,
            "rawText": payload.rawText,
            "createdFromScan": bool(payload.rawText),
            "latitude": latitude,
            "longitude": longitude,
        },
    )
    if not case_row:
        raise HTTPException(status_code=500, detail="Failed to create case")

    accused_person_ids: list[str] = []
    for name in payload.accusedNames:
        if not name or not name.strip():
            continue
        person = _find_or_create_person(name.strip(), "ACCUSED")
        execute(
            '''
            INSERT INTO "CasePerson" (id, "caseId", "personId", role)
            VALUES (%(id)s, %(caseId)s, %(personId)s, 'ACCUSED')
            ''',
            {"id": new_id(), "caseId": case_row["id"], "personId": person["id"]},
        )
        accused_person_ids.append(person["id"])

    for i, person_a in enumerate(accused_person_ids):
        for person_b in accused_person_ids[i + 1 :]:
            existing = fetch_one(
                '''
                SELECT id FROM "Connection"
                WHERE ("personAId" = %(a)s AND "personBId" = %(b)s)
                   OR ("personAId" = %(b)s AND "personBId" = %(a)s)
                LIMIT 1
                ''',
                {"a": person_a, "b": person_b},
            )
            if not existing:
                execute(
                    '''
                    INSERT INTO "Connection" (id, "personAId", "personBId", "relationType", "sourceCaseId")
                    VALUES (%(id)s, %(a)s, %(b)s, 'CO_ACCUSED', %(caseId)s)
                    ''',
                    {"id": new_id(), "a": person_a, "b": person_b, "caseId": case_row["id"]},
                )

    if payload.victimName and payload.victimName != "null":
        victim = _find_or_create_person(payload.victimName, "VICTIM")
        execute(
            '''
            INSERT INTO "CasePerson" (id, "caseId", "personId", role)
            VALUES (%(id)s, %(caseId)s, %(personId)s, 'VICTIM')
            ''',
            {"id": new_id(), "caseId": case_row["id"], "personId": victim["id"]},
        )

    intake_intel.persist_intake_matches(
        case_id=case_row["id"],
        station_id=station_id,
        accused_names=payload.accusedNames,
        victim_name=payload.victimName,
        crime_type=payload.crimeType or "Unknown",
        summary=summary,
        modus_operandi=payload.modusOperandi,
    )

    create_audit_log(
        officer["id"],
        "CREATE_CASE",
        "CASE",
        case_row["id"],
        f"Created via FIR Scan: {fir_number}",
    )

    # A newly registered FIR must appear on the dashboard and network straight
    # away, so drop the cached aggregates rather than waiting out their TTL.
    invalidate_all()
    # Re-evaluate only the affected station. The stable warning fingerprint
    # makes this idempotent and lets connected officers see it on their next poll.
    refresh_hotspot_warnings(station_id=station_id)

    intake = intake_intel.build_case_intake_brief(case_row["id"], officer)
    if "error" in intake:
        intake = None

    return {
        "success": True,
        "caseId": case_row["id"],
        "firNumber": fir_number,
        "intake": intake,
    }


@router.get("/{case_id}")
def get_case(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    case_data = get_case_with_relations(case_id, current_user["officer"])
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")
    return {"case": case_data}


@router.get("/{case_id}/custody-clocks")
def get_custody_clocks(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    """Return only verified, per-accused remand clocks for a visible FIR."""
    case_data = get_case_with_relations(case_id, current_user["officer"])
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")

    rows, storage_ready = list_case_clocks(case_id)
    now = datetime.now(timezone.utc)
    return {
        "storageReady": storage_ready,
        "clocks": [deadline_engine.compute_custody_clock(row, now) for row in rows],
    }


@router.post("/{case_id}/custody-clocks")
def record_custody_clock(
    case_id: str,
    payload: CustodyClockRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Record or correct the first Magistrate-authorised remand for one accused."""
    officer = current_user["officer"]
    require_case_write(officer)
    case_data = get_case_with_relations(case_id, officer)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")
    _require_assigned_io(case_data, officer)

    _, storage_ready = list_case_clocks(case_id)
    if not storage_ready:
        raise HTTPException(
            status_code=503,
            detail="Custody-clock storage is not set up. Apply database migration 0009_case_custody_clocks.sql first.",
        )

    remand_at = _utc_storage_timestamp(payload.firstRemandAt)
    if remand_at > datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="First-remand time cannot be in the future")

    if payload.casePersonId == "ADD_CUSTOM":
        if not payload.newAccusedName or not payload.newAccusedName.strip():
            raise HTTPException(status_code=400, detail="Custom accused name required")
        person = _find_or_create_person(payload.newAccusedName.strip(), "ACCUSED")
        case_person_id_to_use = new_id()
        execute(
            '''
            INSERT INTO "CasePerson" (id, "caseId", "personId", role)
            VALUES (%(id)s, %(caseId)s, %(personId)s, 'ACCUSED')
            ''',
            {"id": case_person_id_to_use, "caseId": case_id, "personId": person["id"]},
        )
    else:
        case_person = fetch_one(
            '''
            SELECT cp.id
            FROM "CasePerson" cp
            WHERE cp.id = %(casePersonId)s
              AND cp."caseId" = %(caseId)s
              AND cp.role = 'ACCUSED'
            ''',
            {"casePersonId": payload.casePersonId, "caseId": case_id},
        )
        if not case_person:
            raise HTTPException(status_code=400, detail="Select an accused linked to this FIR")
        case_person_id_to_use = payload.casePersonId

    existing = fetch_one(
        'SELECT id FROM "CaseCustodyClock" WHERE "casePersonId" = %(casePersonId)s',
        {"casePersonId": case_person_id_to_use},
    )
    params = {
        "caseId": case_id,
        "casePersonId": case_person_id_to_use,
        "firstRemandAt": remand_at,
        "windowDays": payload.windowDays,
        "thresholdBasis": payload.thresholdBasis,
        "legalSectionDetails": payload.legalSectionDetails.strip(),
        "remandOrderReference": payload.remandOrderReference.strip(),
        "notes": payload.notes.strip() if payload.notes and payload.notes.strip() else None,
        "officerId": officer["id"],
    }
    if existing:
        execute(
            '''
            UPDATE "CaseCustodyClock"
            SET "firstRemandAt" = %(firstRemandAt)s,
                "windowDays" = %(windowDays)s,
                "thresholdBasis" = %(thresholdBasis)s,
                "legalSectionDetails" = %(legalSectionDetails)s,
                "remandOrderReference" = %(remandOrderReference)s,
                notes = %(notes)s,
                "updatedById" = %(officerId)s,
                "updatedAt" = NOW()
            WHERE id = %(clockId)s
            ''',
            {**params, "clockId": existing["id"]},
        )
        action = "CORRECT_CUSTODY_CLOCK"
        details = f"Corrected first-remand record for case-person {payload.casePersonId}"
    else:
        execute(
            '''
            INSERT INTO "CaseCustodyClock" (
                id, "caseId", "casePersonId", "firstRemandAt", "windowDays",
                "thresholdBasis", "legalSectionDetails", "remandOrderReference", notes,
                "createdById", "updatedById"
            )
            VALUES (
                %(id)s, %(caseId)s, %(casePersonId)s, %(firstRemandAt)s, %(windowDays)s,
                %(thresholdBasis)s, %(legalSectionDetails)s, %(remandOrderReference)s, %(notes)s,
                %(officerId)s, %(officerId)s
            )
            ''',
            {**params, "id": new_id()},
        )
        action = "RECORD_FIRST_REMAND"
        details = f"Recorded first-remand clock for case-person {payload.casePersonId}"

    create_audit_log(officer["id"], action, "CASE", case_id, details)
    invalidate_all()
    rows, _ = list_case_clocks(case_id)
    clock = next((row for row in rows if row["casePersonId"] == payload.casePersonId), None)
    return {
        "success": True,
        "clock": deadline_engine.compute_custody_clock(clock, datetime.now(timezone.utc)) if clock else None,
    }


@router.post("/{case_id}/custody-clocks/record-filing")
def record_final_report_filing(
    case_id: str,
    payload: CustodyClockFilingRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Record one actual filing reference against all outstanding accused clocks in a FIR."""
    officer = current_user["officer"]
    require_case_write(officer)
    case_data = get_case_with_relations(case_id, officer)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")
    _require_assigned_io(case_data, officer)

    rows, storage_ready = list_case_clocks(case_id)
    if not storage_ready:
        raise HTTPException(
            status_code=503,
            detail="Custody-clock storage is not set up. Apply database migration 0009_case_custody_clocks.sql first.",
        )
    active_rows = [row for row in rows if not row.get("reportFiledAt")]
    if not active_rows:
        raise HTTPException(status_code=400, detail="There are no outstanding custody clocks to mark as filed")

    filed_at = _utc_storage_timestamp(payload.filedAt)
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    if filed_at > now_utc + timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="Filing time cannot be in the future")
    if any(filed_at < _utc_storage_timestamp(row["firstRemandAt"]) for row in active_rows):
        raise HTTPException(status_code=400, detail="Filing time cannot be earlier than an outstanding first-remand record")

    execute(
        '''
        UPDATE "CaseCustodyClock"
        SET "reportFiledAt" = %(filedAt)s,
            "reportReference" = %(reportReference)s,
            "updatedById" = %(officerId)s,
            "updatedAt" = NOW()
        WHERE "caseId" = %(caseId)s
          AND "reportFiledAt" IS NULL
        ''',
        {
            "caseId": case_id,
            "filedAt": filed_at,
            "reportReference": payload.reportReference.strip(),
            "officerId": officer["id"],
        },
    )
    create_audit_log(
        officer["id"],
        "RECORD_FINAL_REPORT_FILING",
        "CASE",
        case_id,
        f"Recorded final-report/charge-sheet filing for {len(active_rows)} custody clock(s)",
    )
    invalidate_all()
    return {"success": True, "updatedClockCount": len(active_rows)}


@router.get("/{case_id}/intake")
def intake(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    brief = intake_intel.build_case_intake_brief(case_id, officer)
    if "error" in brief:
        raise HTTPException(status_code=404, detail=brief["error"])

    create_audit_log(
        officer["id"],
        "CASE_INTAKE",
        "CASE",
        case_id,
        f'Intake brief generated for {brief["firNumber"]}',
    )
    return {"intake": brief}


@router.post("/{case_id}/draft")
def draft(case_id: str, payload: DraftRequest, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    audience = payload.audience if payload.audience in ("SP", "SHO", "IO") else "IO"
    result = intake_intel.draft_case_summary(
        case_id,
        officer,
        audience=audience,
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    create_audit_log(
        officer["id"],
        "DRAFT_CASE_SUMMARY",
        "CASE",
        case_id,
        f"Draft {audience} note generated",
    )
    return {"draft": result["draft"]}


@router.patch("/{case_id}/matches")
def update_match(
    case_id: str,
    payload: MatchUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    if payload.status not in ("CONFIRMED", "REJECTED"):
        raise HTTPException(status_code=400, detail="matchId and status (CONFIRMED|REJECTED) required")

    officer = current_user["officer"]
    require_case_write(officer)
    result = intake_intel.update_match_status(
        payload.matchId,
        payload.status,
        officer,
        case_id=case_id,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return {"success": True, "match": result["match"]}


@router.get("/{case_id}/chargesheet")
async def get_chargesheet(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    case_data = get_case_with_relations(case_id, officer)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")

    row = fetch_one('SELECT "chargesheetDraft" FROM "Case" WHERE id = %(id)s', {"id": case_id})
    return {"success": True, "chargesheetDraft": row.get("chargesheetDraft") if row else None}


@router.put("/{case_id}/chargesheet")
async def update_chargesheet(
    case_id: str,
    payload: ChargesheetUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = current_user["officer"]
    require_case_write(officer)
    case_data = get_case_with_relations(case_id, officer)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")

    execute(
        'UPDATE "Case" SET "chargesheetDraft" = %(draft)s WHERE id = %(id)s',
        {"draft": payload.chargesheetDraft, "id": case_id},
    )
    create_audit_log(
        officer["id"],
        "UPDATE_CHARGESHEET",
        "CASE",
        case_id,
        "Saved edited chargesheet draft",
    )
    return {"success": True}


async def _generate_chargesheet_markdown(case_id: str, officer: dict) -> str:
    """Compatibility view backed by the structured, non-AI final report."""
    require_case_write(officer)
    result = final_reports.get_report(case_id, officer)
    if not result.get("storageReady"):
        raise HTTPException(status_code=503, detail="Apply the isolated final-report migration before creating a draft")
    if not result.get("report"):
        result = final_reports.initialize_report(case_id, officer)
    report = result.get("report")
    if not report:
        raise HTTPException(status_code=500, detail="The structured final report could not be initialized")

    chargesheet_markdown = final_reports.render_legacy_markdown(report["payload"])
    execute(
        'UPDATE "Case" SET "chargesheetDraft" = %(draft)s WHERE id = %(id)s',
        {"draft": chargesheet_markdown, "id": case_id},
    )
    create_audit_log(
        officer["id"],
        "GENERATE_CHARGESHEET",
        "CASE",
        case_id,
        f'Deterministic compatibility view saved from final-report version {report["versionNumber"]}',
    )
    return chargesheet_markdown


@router.post("/{case_id}/chargesheet")
async def chargesheet(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    """Generate a chargesheet (used by the standalone Chargesheet page)."""
    officer = current_user["officer"]
    chargesheet_markdown = await _generate_chargesheet_markdown(case_id, officer)
    return {"success": True, "chargesheet": chargesheet_markdown}


@router.post("/{case_id}/chargesheet/generate")
async def generate_chargesheet(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    """Generate a chargesheet draft (used by ChargesheetEditor)."""
    officer = current_user["officer"]
    chargesheet_markdown = await _generate_chargesheet_markdown(case_id, officer)
    return {"success": True, "chargesheet": chargesheet_markdown}
