"""Case-level source records used by the deterministic final-report builder.

These records belong to the investigation, not to one report version.  An IO
can correct them once and explicitly refresh an editable final-report draft.
No AI service is involved in this module.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import psycopg
from fastapi import HTTPException

from app.services.case_access import get_case_with_relations
from app.services.db import fetch_all, fetch_one, get_conn, new_id, serialize_row
from app.services.hierarchy import is_police_it


EVENT_TYPES = {
    "IDENTIFIED",
    "ARRESTED",
    "FORWARDED_TO_COURT",
    "BAIL_GRANTED",
    "RELEASED_ON_BAIL",
    "ABSCONDING",
    "SURRENDERED",
    "OTHER",
}
IDENTITY_STATUSES = {"NOT_RECORDED", "PENDING", "VERIFIED", "UNVERIFIED"}
DISPOSITIONS = {"NOT_RECORDED", "CHARGE_SHEETED", "NOT_CHARGE_SHEETED"}
FINAL_DECISIONS = {"NOT_RECORDED", "RETAINED", "ADDED", "DROPPED"}
RESULT_STATUSES = {"NOT_RECORDED", "PENDING", "RECEIVED", "NOT_APPLICABLE"}


def _text(value: Any, limit: int = 4_000) -> str:
    return str(value or "").strip()[:limit]


def _optional(value: Any, limit: int = 4_000) -> str | None:
    cleaned = _text(value, limit)
    return cleaned or None


def _choice(value: Any, choices: set[str], fallback: str) -> str:
    cleaned = _text(value, 100).upper()
    return cleaned if cleaned in choices else fallback


def _instant(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _db_timestamp(value: Any) -> datetime | None:
    parsed = _instant(value)
    return parsed.replace(tzinfo=None) if parsed else None


def _source_rows(case_id: str) -> dict[str, list[dict[str, Any]]]:
    parties = fetch_all(
        '''
        SELECT cp.id AS "casePersonId", cp."personId", cp.role,
               p.name, p.phone, p.address,
               COALESCE(pp."isComplainant", false) AS "isComplainant",
               pp.alias, pp."parentName", pp."birthYear", pp.gender,
               pp.nationality, pp.occupation, pp."permanentAddress",
               COALESCE(pp."identityStatus", 'NOT_RECORDED') AS "identityStatus",
               pp."identityType", pp."identityReference", pp."verificationNotes",
               pp."relationshipToVictim", pp."injuryOrLoss", pp."statementSummary",
               COALESCE(pp."evidenceType", 'ORAL') AS "evidenceType",
               COALESCE(pp.disposition, 'NOT_RECORDED') AS disposition,
               pp."dispositionReason", COALESCE(pp."bailStatus", 'NOT_RECORDED') AS "bailStatus",
               pp."regularCriminalNumber", pp."previousConvictions", pp."suretyDetails"
        FROM "CasePerson" cp
        JOIN "Person" p ON cp."personId" = p.id
        LEFT JOIN "CasePartyProfile" pp ON pp."casePersonId" = cp.id
        WHERE cp."caseId" = %(caseId)s
        ORDER BY CASE cp.role WHEN 'ACCUSED' THEN 1 WHEN 'VICTIM' THEN 2 ELSE 3 END, p.name
        ''',
        {"caseId": case_id},
    )
    events = fetch_all(
        '''
        SELECT pe.id, pe."casePersonId", pe."eventType", pe."occurredAt",
               pe.reference, pe.notes, o.name AS "createdByName", o."badgeId" AS "createdByBadgeId"
        FROM "CasePartyEvent" pe
        JOIN "Officer" o ON pe."createdById" = o.id
        WHERE pe."caseId" = %(caseId)s
        ORDER BY pe."occurredAt", pe.id
        ''',
        {"caseId": case_id},
    )
    legal_sections = fetch_all(
        '''SELECT id, "catalogId", "actCode", "sectionNumber", title, punishment,
                  "conditionNote", "initiallyAlleged", "finalDecision", "decisionReason",
                  "approvalReference"
           FROM "CaseLegalSection" WHERE "caseId" = %(caseId)s
           ORDER BY "actCode", "sectionNumber", id''',
        {"caseId": case_id},
    )
    property_items = fetch_all(
        '''SELECT id, "sourceEvidenceId", category, description, quantity, "estimatedValue",
                  "recoveryStatus", "recoveredAt", "seizureMemoReference", "disposalStatus"
           FROM "CasePropertyItem" WHERE "caseId" = %(caseId)s ORDER BY "createdAt", id''',
        {"caseId": case_id},
    )
    expert_results = fetch_all(
        '''SELECT id, "sourceDocumentId", type, status, "referenceNumber", "resultDate", summary
           FROM "CaseExpertResult" WHERE "caseId" = %(caseId)s ORDER BY "createdAt", id''',
        {"caseId": case_id},
    )
    evidence_assessments = fetch_all(
        '''
        SELECT e.id AS "evidenceId", e.type, e.description, e.status, e.timestamp,
               COALESCE(ea."resultStatus", 'NOT_RECORDED') AS "resultStatus",
               ea."resultSummary", ea."referenceNumber"
        FROM "Evidence" e
        LEFT JOIN "EvidenceAssessment" ea ON ea."evidenceId" = e.id
        WHERE e."caseId" = %(caseId)s ORDER BY e.timestamp, e.id
        ''',
        {"caseId": case_id},
    )
    documents = fetch_all(
        '''SELECT id, name, "createdAt" FROM "Document"
           WHERE "caseId" = %(caseId)s ORDER BY "createdAt", id''',
        {"caseId": case_id},
    )
    custody_clocks = fetch_all(
        '''SELECT "casePersonId", "firstRemandAt", "windowDays", "remandOrderReference"
           FROM "CaseCustodyClock" WHERE "caseId" = %(caseId)s ORDER BY "firstRemandAt", id''',
        {"caseId": case_id},
    )
    return {
        "parties": parties,
        "events": events,
        "legalSections": legal_sections,
        "propertyItems": property_items,
        "expertResults": expert_results,
        "evidenceAssessments": evidence_assessments,
        "documents": documents,
        "custodyClocks": custody_clocks,
    }


def validate_sources(
    payload: dict[str, Any],
    *,
    custody_clocks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return actionable contradictions without silently changing source facts."""
    issues: list[dict[str, str]] = []

    def add(code: str, severity: str, message: str, path: str) -> None:
        issues.append({"code": code, "severity": severity, "message": message, "path": path})

    parties = list(payload.get("parties") or [])
    events = list(payload.get("events") or [])
    complainants = [row for row in parties if row.get("isComplainant")]
    if len(complainants) > 1:
        add("MULTIPLE_COMPLAINANTS", "ERROR", "Only one case person can be the primary complainant.", "parties")
    if not complainants:
        add("COMPLAINANT_NOT_RECORDED", "EXPLANATION", "No primary complainant has been selected.", "parties")

    for row in parties:
        key = _text(row.get("casePersonId"), 100)
        if row.get("disposition") == "NOT_CHARGE_SHEETED" and not _text(row.get("dispositionReason")):
            add("DISPOSITION_REASON_REQUIRED", "ERROR", "A person not charge-sheeted requires a recorded reason.", f"parties.{key}.dispositionReason")
        if row.get("identityStatus") == "VERIFIED" and not (
            _text(row.get("identityReference")) or _text(row.get("verificationNotes"))
        ):
            add("IDENTITY_VERIFICATION_REFERENCE_MISSING", "EXPLANATION", "Verified identity should cite the record or verification note used.", f"parties.{key}.identityReference")

    legal_seen: set[tuple[str, str]] = set()
    for row in payload.get("legalSections") or []:
        key = (_text(row.get("actCode"), 100).upper(), _text(row.get("sectionNumber"), 100).upper())
        if key in legal_seen:
            add("DUPLICATE_LEGAL_SECTION", "ERROR", "The same Act and section is listed more than once.", "legalSections")
        legal_seen.add(key)
        if row.get("finalDecision") in {"ADDED", "DROPPED"} and not _text(row.get("decisionReason")):
            add("SECTION_DECISION_REASON_REQUIRED", "ERROR", "Added or dropped sections require an investigation reason.", f"legalSections.{row.get('id') or 'new'}.decisionReason")

    for row in payload.get("propertyItems") or []:
        if not _text(row.get("description")):
            add("PROPERTY_DESCRIPTION_REQUIRED", "ERROR", "Every case-property item needs a description.", f"propertyItems.{row.get('id') or 'new'}.description")
    for row in payload.get("expertResults") or []:
        if row.get("status") == "RECEIVED" and not _text(row.get("summary")):
            add("EXPERT_SUMMARY_REQUIRED", "ERROR", "A received expert result needs its finding summary.", f"expertResults.{row.get('id') or 'new'}.summary")
    for row in payload.get("evidenceAssessments") or []:
        if row.get("resultStatus") == "RECEIVED" and not _text(row.get("resultSummary")):
            add("EVIDENCE_RESULT_SUMMARY_REQUIRED", "ERROR", "Received evidence analysis needs a result summary.", f"evidenceAssessments.{row.get('evidenceId')}.resultSummary")

    events_by_person: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        events_by_person.setdefault(_text(event.get("casePersonId"), 100), []).append(event)
    clocks_by_person = {row["casePersonId"]: row for row in custody_clocks or []}
    for case_person_id, rows in events_by_person.items():
        arrests = [_instant(row.get("occurredAt")) for row in rows if row.get("eventType") == "ARRESTED"]
        arrest_at = min((value for value in arrests if value), default=None)
        for row in rows:
            event_at = _instant(row.get("occurredAt"))
            if row.get("eventType") in {"FORWARDED_TO_COURT", "BAIL_GRANTED", "RELEASED_ON_BAIL"}:
                if not arrest_at:
                    add("ARREST_EVENT_MISSING", "ERROR", "Court forwarding or bail is recorded without an arrest event.", f"events.{row.get('id') or 'new'}")
                elif event_at and event_at < arrest_at:
                    add("EVENT_BEFORE_ARREST", "ERROR", "Court forwarding or bail cannot precede the recorded arrest.", f"events.{row.get('id') or 'new'}.occurredAt")
        remand_at = _instant((clocks_by_person.get(case_person_id) or {}).get("firstRemandAt"))
        if remand_at and arrest_at and remand_at < arrest_at:
            add("REMAND_BEFORE_ARREST", "ERROR", "First remand cannot precede the recorded arrest.", f"parties.{case_person_id}")

    counts = {
        "errors": sum(issue["severity"] == "ERROR" for issue in issues),
        "explanations": sum(issue["severity"] == "EXPLANATION" for issue in issues),
    }
    return {"ready": counts["errors"] == 0, "counts": counts, "issues": issues}


def load_report_sources(case_id: str, officer: dict[str, Any]) -> dict[str, Any]:
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    try:
        state = fetch_one(
            '''SELECT revision, "updatedAt", "updatedById" FROM "CaseReportSourceState"
               WHERE "caseId" = %(caseId)s''',
            {"caseId": case_id},
        )
        rows = _source_rows(case_id)
    except psycopg.errors.UndefinedTable:
        return {"storageReady": False, "revision": 0, "case": case, "sources": None}
    validation = validate_sources(rows, custody_clocks=rows["custodyClocks"])
    return {
        "storageReady": True,
        "revision": int((state or {}).get("revision") or 0),
        "updatedAt": (state or {}).get("updatedAt"),
        "case": case,
        "sources": rows,
        "validation": validation,
    }


def _normalize_payload(payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    parties: list[dict[str, Any]] = []
    for raw in list(payload.get("parties") or [])[:300]:
        birth_year = raw.get("birthYear")
        try:
            birth_year = int(birth_year) if birth_year not in (None, "") else None
        except (TypeError, ValueError):
            birth_year = None
        parties.append(
            {
                "casePersonId": _text(raw.get("casePersonId"), 100),
                "isComplainant": bool(raw.get("isComplainant")),
                "alias": _optional(raw.get("alias"), 300),
                "parentName": _optional(raw.get("parentName"), 300),
                "birthYear": birth_year,
                "gender": _optional(raw.get("gender"), 100),
                "nationality": _optional(raw.get("nationality"), 100),
                "occupation": _optional(raw.get("occupation"), 300),
                "permanentAddress": _optional(raw.get("permanentAddress"), 1_000),
                "identityStatus": _choice(raw.get("identityStatus"), IDENTITY_STATUSES, "NOT_RECORDED"),
                "identityType": _optional(raw.get("identityType"), 200),
                "identityReference": _optional(raw.get("identityReference"), 300),
                "verificationNotes": _optional(raw.get("verificationNotes"), 2_000),
                "relationshipToVictim": _optional(raw.get("relationshipToVictim"), 300),
                "injuryOrLoss": _optional(raw.get("injuryOrLoss"), 4_000),
                "statementSummary": _optional(raw.get("statementSummary"), 10_000),
                "evidenceType": _text(raw.get("evidenceType"), 100) or "ORAL",
                "disposition": _choice(raw.get("disposition"), DISPOSITIONS, "NOT_RECORDED"),
                "dispositionReason": _optional(raw.get("dispositionReason"), 4_000),
                "bailStatus": _text(raw.get("bailStatus"), 100) or "NOT_RECORDED",
                "regularCriminalNumber": _optional(raw.get("regularCriminalNumber"), 300),
                "previousConvictions": _optional(raw.get("previousConvictions"), 4_000),
                "suretyDetails": _optional(raw.get("suretyDetails"), 4_000),
            }
        )
    events = [
        {
            "id": _text(raw.get("id"), 100) or new_id(),
            "casePersonId": _text(raw.get("casePersonId"), 100),
            "eventType": _choice(raw.get("eventType"), EVENT_TYPES, "OTHER"),
            "occurredAt": _db_timestamp(raw.get("occurredAt")),
            "reference": _optional(raw.get("reference"), 500),
            "notes": _optional(raw.get("notes"), 2_000),
        }
        for raw in list(payload.get("events") or [])[:1_000]
    ]
    legal_sections = [
        {
            "id": _text(raw.get("id"), 100) or new_id(),
            "catalogId": _optional(raw.get("catalogId"), 100),
            "actCode": _text(raw.get("actCode"), 100).upper(),
            "sectionNumber": _text(raw.get("sectionNumber"), 100),
            "title": _text(raw.get("title"), 500),
            "punishment": _optional(raw.get("punishment"), 1_000),
            "conditionNote": _optional(raw.get("conditionNote"), 2_000),
            "initiallyAlleged": bool(raw.get("initiallyAlleged")),
            "finalDecision": _choice(raw.get("finalDecision"), FINAL_DECISIONS, "NOT_RECORDED"),
            "decisionReason": _optional(raw.get("decisionReason"), 4_000),
            "approvalReference": _optional(raw.get("approvalReference"), 500),
        }
        for raw in list(payload.get("legalSections") or [])[:300]
    ]
    property_items = [
        {
            "id": _text(raw.get("id"), 100) or new_id(),
            "sourceEvidenceId": _optional(raw.get("sourceEvidenceId"), 100),
            "category": _text(raw.get("category"), 100) or "OTHER",
            "description": _text(raw.get("description"), 2_000),
            "quantity": _optional(raw.get("quantity"), 100),
            "estimatedValue": _optional(raw.get("estimatedValue"), 100),
            "recoveryStatus": _text(raw.get("recoveryStatus"), 100) or "NOT_RECORDED",
            "recoveredAt": _db_timestamp(raw.get("recoveredAt")),
            "seizureMemoReference": _optional(raw.get("seizureMemoReference"), 300),
            "disposalStatus": _text(raw.get("disposalStatus"), 100) or "NOT_RECORDED",
        }
        for raw in list(payload.get("propertyItems") or [])[:500]
    ]
    expert_results = [
        {
            "id": _text(raw.get("id"), 100) or new_id(),
            "sourceDocumentId": _optional(raw.get("sourceDocumentId"), 100),
            "type": _text(raw.get("type"), 100) or "OTHER",
            "status": _choice(raw.get("status"), RESULT_STATUSES, "NOT_RECORDED"),
            "referenceNumber": _optional(raw.get("referenceNumber"), 300),
            "resultDate": _text(raw.get("resultDate"), 10) or None,
            "summary": _optional(raw.get("summary"), 4_000),
        }
        for raw in list(payload.get("expertResults") or [])[:300]
    ]
    evidence_assessments = [
        {
            "evidenceId": _text(raw.get("evidenceId"), 100),
            "resultStatus": _choice(raw.get("resultStatus"), RESULT_STATUSES, "NOT_RECORDED"),
            "resultSummary": _optional(raw.get("resultSummary"), 4_000),
            "referenceNumber": _optional(raw.get("referenceNumber"), 300),
        }
        for raw in list(payload.get("evidenceAssessments") or [])[:1_000]
    ]
    return {
        "parties": parties,
        "events": events,
        "legalSections": legal_sections,
        "propertyItems": property_items,
        "expertResults": expert_results,
        "evidenceAssessments": evidence_assessments,
    }


def _ensure_owned_ids(case_id: str, normalized: dict[str, list[dict[str, Any]]]) -> None:
    case_person_ids = {row["id"] for row in fetch_all('SELECT id FROM "CasePerson" WHERE "caseId" = %(caseId)s', {"caseId": case_id})}
    evidence_ids = {row["id"] for row in fetch_all('SELECT id FROM "Evidence" WHERE "caseId" = %(caseId)s', {"caseId": case_id})}
    document_ids = {row["id"] for row in fetch_all('SELECT id FROM "Document" WHERE "caseId" = %(caseId)s', {"caseId": case_id})}
    used_people = {row["casePersonId"] for row in normalized["parties"] + normalized["events"]}
    used_evidence = {row["evidenceId"] for row in normalized["evidenceAssessments"]}
    used_evidence.update(row["sourceEvidenceId"] for row in normalized["propertyItems"] if row["sourceEvidenceId"])
    used_documents = {row["sourceDocumentId"] for row in normalized["expertResults"] if row["sourceDocumentId"]}
    if not used_people.issubset(case_person_ids):
        raise HTTPException(status_code=400, detail="A selected person does not belong to this case")
    if not used_evidence.issubset(evidence_ids):
        raise HTTPException(status_code=400, detail="A selected evidence record does not belong to this case")
    if not used_documents.issubset(document_ids):
        raise HTTPException(status_code=400, detail="A selected document does not belong to this case")
    if any(not row["occurredAt"] for row in normalized["events"]):
        raise HTTPException(status_code=400, detail="Every person event requires a valid date and time")
    if any(not row["actCode"] or not row["sectionNumber"] or not row["title"] for row in normalized["legalSections"]):
        raise HTTPException(status_code=400, detail="Every legal section requires an Act, section number and title")
    for table, collection in (
        ("CasePartyEvent", "events"),
        ("CaseLegalSection", "legalSections"),
        ("CasePropertyItem", "propertyItems"),
        ("CaseExpertResult", "expertResults"),
    ):
        ids = [row["id"] for row in normalized[collection]]
        if not ids:
            continue
        existing = fetch_all(
            f'SELECT id, "caseId" FROM "{table}" WHERE id = ANY(%(ids)s::text[])',
            {"ids": ids},
        )
        if any(row["caseId"] != case_id for row in existing):
            raise HTTPException(status_code=400, detail="A report-source record does not belong to this case")


def _delete_missing(cur: psycopg.Cursor, table: str, case_id: str, ids: list[str]) -> None:
    cur.execute(
        f'DELETE FROM "{table}" WHERE "caseId" = %(caseId)s AND id != ALL(%(ids)s::text[])',
        {"caseId": case_id, "ids": ids},
    )


def save_report_sources(
    case_id: str,
    officer: dict[str, Any],
    *,
    expected_revision: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if is_police_it(officer.get("role")):
        raise HTTPException(status_code=403, detail="Your role cannot modify investigation records")
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.get("currentIoId") and case["currentIoId"] != officer["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned Investigating Officer can update report source records")
    normalized = _normalize_payload(payload)
    _ensure_owned_ids(case_id, normalized)
    source_validation = validate_sources(normalized)
    if sum(bool(row.get("isComplainant")) for row in normalized["parties"]) > 1:
        raise HTTPException(status_code=422, detail={"message": "Only one primary complainant is allowed", "validation": source_validation})
    if any(issue["code"] == "DUPLICATE_LEGAL_SECTION" for issue in source_validation["issues"]):
        raise HTTPException(status_code=422, detail={"message": "Duplicate legal sections are not allowed", "validation": source_validation})

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                '''INSERT INTO "CaseReportSourceState"
                     ("caseId", revision, "createdById", "updatedById", "createdAt", "updatedAt")
                   VALUES (%(caseId)s, 0, %(officerId)s, %(officerId)s, NOW(), NOW())
                   ON CONFLICT ("caseId") DO NOTHING''',
                {"caseId": case_id, "officerId": officer["id"]},
            )
            cur.execute('SELECT revision FROM "CaseReportSourceState" WHERE "caseId" = %(caseId)s FOR UPDATE', {"caseId": case_id})
            state = serialize_row(cur.fetchone())
            if not state or int(state["revision"]) != expected_revision:
                raise HTTPException(status_code=409, detail="Report source data changed in another session; reload before saving")

            cur.execute('UPDATE "CasePartyProfile" SET "isComplainant" = false WHERE "caseId" = %(caseId)s', {"caseId": case_id})
            for row in normalized["parties"]:
                cur.execute(
                    '''INSERT INTO "CasePartyProfile"
                         ("casePersonId", "caseId", "isComplainant", alias, "parentName", "birthYear", gender,
                          nationality, occupation, "permanentAddress", "identityStatus", "identityType",
                          "identityReference", "verificationNotes", "relationshipToVictim", "injuryOrLoss",
                          "statementSummary", "evidenceType", disposition, "dispositionReason", "bailStatus",
                          "regularCriminalNumber", "previousConvictions", "suretyDetails", "updatedById",
                          "createdAt", "updatedAt")
                       VALUES
                         (%(casePersonId)s, %(caseId)s, %(isComplainant)s, %(alias)s, %(parentName)s, %(birthYear)s,
                          %(gender)s, %(nationality)s, %(occupation)s, %(permanentAddress)s, %(identityStatus)s,
                          %(identityType)s, %(identityReference)s, %(verificationNotes)s, %(relationshipToVictim)s,
                          %(injuryOrLoss)s, %(statementSummary)s, %(evidenceType)s, %(disposition)s,
                          %(dispositionReason)s, %(bailStatus)s, %(regularCriminalNumber)s, %(previousConvictions)s,
                          %(suretyDetails)s, %(officerId)s, NOW(), NOW())
                       ON CONFLICT ("casePersonId") DO UPDATE SET
                         "isComplainant" = EXCLUDED."isComplainant", alias = EXCLUDED.alias,
                         "parentName" = EXCLUDED."parentName", "birthYear" = EXCLUDED."birthYear",
                         gender = EXCLUDED.gender, nationality = EXCLUDED.nationality, occupation = EXCLUDED.occupation,
                         "permanentAddress" = EXCLUDED."permanentAddress", "identityStatus" = EXCLUDED."identityStatus",
                         "identityType" = EXCLUDED."identityType", "identityReference" = EXCLUDED."identityReference",
                         "verificationNotes" = EXCLUDED."verificationNotes", "relationshipToVictim" = EXCLUDED."relationshipToVictim",
                         "injuryOrLoss" = EXCLUDED."injuryOrLoss", "statementSummary" = EXCLUDED."statementSummary",
                         "evidenceType" = EXCLUDED."evidenceType", disposition = EXCLUDED.disposition,
                         "dispositionReason" = EXCLUDED."dispositionReason", "bailStatus" = EXCLUDED."bailStatus",
                         "regularCriminalNumber" = EXCLUDED."regularCriminalNumber",
                         "previousConvictions" = EXCLUDED."previousConvictions", "suretyDetails" = EXCLUDED."suretyDetails",
                         "updatedById" = EXCLUDED."updatedById", "updatedAt" = NOW()''',
                    {**row, "caseId": case_id, "officerId": officer["id"]},
                )

            _delete_missing(cur, "CasePartyEvent", case_id, [row["id"] for row in normalized["events"]])
            for row in normalized["events"]:
                cur.execute(
                    '''INSERT INTO "CasePartyEvent"
                         (id, "caseId", "casePersonId", "eventType", "occurredAt", reference, notes, "createdById", "createdAt")
                       VALUES (%(id)s, %(caseId)s, %(casePersonId)s, %(eventType)s, %(occurredAt)s,
                               %(reference)s, %(notes)s, %(officerId)s, NOW())
                       ON CONFLICT (id) DO UPDATE SET "eventType" = EXCLUDED."eventType",
                         "occurredAt" = EXCLUDED."occurredAt", reference = EXCLUDED.reference, notes = EXCLUDED.notes''',
                    {**row, "caseId": case_id, "officerId": officer["id"]},
                )

            _delete_missing(cur, "CaseLegalSection", case_id, [row["id"] for row in normalized["legalSections"]])
            for row in normalized["legalSections"]:
                cur.execute(
                    '''INSERT INTO "CaseLegalSection"
                         (id, "caseId", "catalogId", "actCode", "sectionNumber", title, punishment, "conditionNote",
                          "initiallyAlleged", "finalDecision", "decisionReason", "approvalReference",
                          "createdById", "updatedById", "createdAt", "updatedAt")
                       VALUES (%(id)s, %(caseId)s, %(catalogId)s, %(actCode)s, %(sectionNumber)s, %(title)s,
                               %(punishment)s, %(conditionNote)s, %(initiallyAlleged)s, %(finalDecision)s,
                               %(decisionReason)s, %(approvalReference)s, %(officerId)s, %(officerId)s, NOW(), NOW())
                       ON CONFLICT (id) DO UPDATE SET "catalogId" = EXCLUDED."catalogId", "actCode" = EXCLUDED."actCode",
                         "sectionNumber" = EXCLUDED."sectionNumber", title = EXCLUDED.title, punishment = EXCLUDED.punishment,
                         "conditionNote" = EXCLUDED."conditionNote", "initiallyAlleged" = EXCLUDED."initiallyAlleged",
                         "finalDecision" = EXCLUDED."finalDecision", "decisionReason" = EXCLUDED."decisionReason",
                         "approvalReference" = EXCLUDED."approvalReference", "updatedById" = EXCLUDED."updatedById", "updatedAt" = NOW()''',
                    {**row, "caseId": case_id, "officerId": officer["id"]},
                )

            _delete_missing(cur, "CasePropertyItem", case_id, [row["id"] for row in normalized["propertyItems"]])
            for row in normalized["propertyItems"]:
                cur.execute(
                    '''INSERT INTO "CasePropertyItem"
                         (id, "caseId", "sourceEvidenceId", category, description, quantity, "estimatedValue",
                          "recoveryStatus", "recoveredAt", "seizureMemoReference", "disposalStatus",
                          "createdById", "updatedById", "createdAt", "updatedAt")
                       VALUES (%(id)s, %(caseId)s, %(sourceEvidenceId)s, %(category)s, %(description)s, %(quantity)s,
                               %(estimatedValue)s, %(recoveryStatus)s, %(recoveredAt)s, %(seizureMemoReference)s,
                               %(disposalStatus)s, %(officerId)s, %(officerId)s, NOW(), NOW())
                       ON CONFLICT (id) DO UPDATE SET "sourceEvidenceId" = EXCLUDED."sourceEvidenceId",
                         category = EXCLUDED.category, description = EXCLUDED.description, quantity = EXCLUDED.quantity,
                         "estimatedValue" = EXCLUDED."estimatedValue", "recoveryStatus" = EXCLUDED."recoveryStatus",
                         "recoveredAt" = EXCLUDED."recoveredAt", "seizureMemoReference" = EXCLUDED."seizureMemoReference",
                         "disposalStatus" = EXCLUDED."disposalStatus", "updatedById" = EXCLUDED."updatedById", "updatedAt" = NOW()''',
                    {**row, "caseId": case_id, "officerId": officer["id"]},
                )

            _delete_missing(cur, "CaseExpertResult", case_id, [row["id"] for row in normalized["expertResults"]])
            for row in normalized["expertResults"]:
                cur.execute(
                    '''INSERT INTO "CaseExpertResult"
                         (id, "caseId", "sourceDocumentId", type, status, "referenceNumber", "resultDate", summary,
                          "createdById", "updatedById", "createdAt", "updatedAt")
                       VALUES (%(id)s, %(caseId)s, %(sourceDocumentId)s, %(type)s, %(status)s, %(referenceNumber)s,
                               %(resultDate)s, %(summary)s, %(officerId)s, %(officerId)s, NOW(), NOW())
                       ON CONFLICT (id) DO UPDATE SET "sourceDocumentId" = EXCLUDED."sourceDocumentId", type = EXCLUDED.type,
                         status = EXCLUDED.status, "referenceNumber" = EXCLUDED."referenceNumber",
                         "resultDate" = EXCLUDED."resultDate", summary = EXCLUDED.summary,
                         "updatedById" = EXCLUDED."updatedById", "updatedAt" = NOW()''',
                    {**row, "caseId": case_id, "officerId": officer["id"]},
                )

            incoming_evidence_ids = [row["evidenceId"] for row in normalized["evidenceAssessments"]]
            cur.execute(
                '''DELETE FROM "EvidenceAssessment"
                   WHERE "caseId" = %(caseId)s AND "evidenceId" != ALL(%(ids)s::text[])''',
                {"caseId": case_id, "ids": incoming_evidence_ids},
            )
            for row in normalized["evidenceAssessments"]:
                cur.execute(
                    '''INSERT INTO "EvidenceAssessment"
                         ("evidenceId", "caseId", "resultStatus", "resultSummary", "referenceNumber", "updatedById", "createdAt", "updatedAt")
                       VALUES (%(evidenceId)s, %(caseId)s, %(resultStatus)s, %(resultSummary)s, %(referenceNumber)s,
                               %(officerId)s, NOW(), NOW())
                       ON CONFLICT ("evidenceId") DO UPDATE SET "resultStatus" = EXCLUDED."resultStatus",
                         "resultSummary" = EXCLUDED."resultSummary", "referenceNumber" = EXCLUDED."referenceNumber",
                         "updatedById" = EXCLUDED."updatedById", "updatedAt" = NOW()''',
                    {**row, "caseId": case_id, "officerId": officer["id"]},
                )

            cur.execute(
                '''UPDATE "CaseReportSourceState" SET revision = revision + 1,
                         "updatedById" = %(officerId)s, "updatedAt" = NOW()
                   WHERE "caseId" = %(caseId)s''',
                {"caseId": case_id, "officerId": officer["id"]},
            )
        conn.commit()
    return load_report_sources(case_id, officer)


def load_sources_for_report(case_id: str) -> dict[str, Any] | None:
    """Load sources after the report service has already scoped the parent case."""
    try:
        state = fetch_one('SELECT revision FROM "CaseReportSourceState" WHERE "caseId" = %(caseId)s', {"caseId": case_id})
        rows = _source_rows(case_id)
    except psycopg.errors.UndefinedTable:
        return None
    return {"revision": int((state or {}).get("revision") or 0), **rows}
