from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services.parallel import invalidate_all
from app.services import geocoder, intake_intel
from app.services.case_access import (
    create_audit_log,
    get_case_with_relations,
    station_filter_sql,
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
from app.services.openrouter import chat_completion

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
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    scope_sql, scope_params = station_filter_sql(is_sp, officer["stationId"], alias="c")
    params: dict = {**scope_params}
    filters = ""

    if crimeType and crimeType not in ("All Crimes", "all"):
        filters += ' AND c."crimeType" = %(crimeType)s'
        params["crimeType"] = crimeType

    if stationId and stationId != "all" and is_sp:
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

            station_scope = ""
            station_params: dict = {}
            if not is_sp:
                station_scope = ' WHERE ps.id = %(stationId)s'
                station_params = {"stationId": officer["stationId"]}
            cur.execute(
                f'''
                SELECT ps.id, ps.name
                FROM "PoliceStation" ps
                {station_scope}
                ORDER BY ps.name
                ''',
                station_params,
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
    station_id = officer["stationId"]
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

    is_sp = officer.get("role") == "SP"
    intake = intake_intel.build_case_intake_brief(case_row["id"], station_id, is_sp=is_sp)
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


@router.get("/{case_id}/intake")
def intake(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    brief = intake_intel.build_case_intake_brief(case_id, officer["stationId"], is_sp=is_sp)
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
    is_sp = officer.get("role") == "SP"
    result = intake_intel.draft_case_summary(
        case_id,
        officer["stationId"],
        is_sp=is_sp,
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
    is_sp = officer.get("role") == "SP"
    result = intake_intel.update_match_status(
        payload.matchId,
        payload.status,
        officer["id"],
        officer["stationId"],
        is_sp=is_sp,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    if result["match"]["caseId"] != case_id:
        raise HTTPException(status_code=400, detail="Match does not belong to this case")
    return {"success": True, "match": result["match"]}


@router.get("/{case_id}/chargesheet")
async def get_chargesheet(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    from app.services.db import fetch_one
    officer = current_user["officer"]
    case_data = get_case_with_relations(case_id, officer)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")
        
    row = fetch_one('SELECT "chargesheetDraft" FROM "Case" WHERE id = %(id)s', {"id": case_id})
    return {"success": True, "chargesheetDraft": row.get("chargesheetDraft") if row else None}


@router.put("/{case_id}/chargesheet")
async def update_chargesheet(case_id: str, payload: ChargesheetUpdateRequest, current_user: dict = Depends(get_current_user)) -> dict:
    from app.services.db import execute
    officer = current_user["officer"]
    case_data = get_case_with_relations(case_id, officer)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")
        
    execute(
        'UPDATE "Case" SET "chargesheetDraft" = %(draft)s WHERE id = %(id)s',
        {"draft": payload.chargesheetDraft, "id": case_id}
    )
    return {"success": True}


@router.post("/{case_id}/chargesheet/generate")
async def generate_chargesheet(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    case_data = get_case_with_relations(case_id, officer)
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")

    accused_list = ", ".join(
        cp["person"]["name"]
        for cp in case_data.get("casePersons", [])
        if cp["role"] == "ACCUSED"
    )
    victim_list = ", ".join(
        cp["person"]["name"]
        for cp in case_data.get("casePersons", [])
        if cp["role"] == "VICTIM"
    )

    system_prompt = '''You are a highly experienced Indian Police Service (IPS) officer and legal expert.
Your task is to draft a highly formal, legally sound "Final Report / Chargesheet under Section 173 CrPC".
You will be provided with the facts of the case.
You must return the document formatted beautifully in Markdown.

Include the following sections:
1. FORMAL HEADING (e.g. FINAL REPORT UNDER SECTION 173 CrPC)
2. CASE DETAILS (FIR Number, Date, Station)
3. DETAILS OF ACCUSED (Name, Status)
4. BRIEF FACTS OF THE CASE (Based on the summary)
5. EVIDENCE & WITNESSES (Invent some plausible police procedures taken, e.g., "Site map drawn, statements recorded under Section 161 CrPC")
6. CHARGES (Suggest relevant IPC/BNS sections based on the crime type)
7. CONCLUSION & PRAYER (Requesting the court to take cognizance)

Highlight any MISSING critical information (like "Arrest Memo not attached", "Forensic Report pending") in bold or as a note.

DO NOT output anything other than the markdown document.'''

    user_prompt = f'''
FIR NUMBER: {case_data["firNumber"]}
CRIME TYPE: {case_data["crimeType"]}
INCIDENT DATE: {case_data["incidentDate"]}
ACCUSED: {accused_list or "None listed"}
VICTIM: {victim_list or "None listed"}
SUMMARY: {case_data.get("summary") or "No summary available"}
RAW TEXT: {case_data.get("rawExtractedText") or "N/A"}
'''

    chargesheet_markdown = await chat_completion(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
    )
    if isinstance(chargesheet_markdown, dict):
        chargesheet_markdown = chargesheet_markdown.get("content") or "Failed to generate chargesheet."

    if chargesheet_markdown:
        from app.services.db import execute
        execute(
            'UPDATE "Case" SET "chargesheetDraft" = %(draft)s WHERE id = %(id)s',
            {"draft": chargesheet_markdown, "id": case_id}
        )

    return {"success": True, "chargesheet": chargesheet_markdown}
