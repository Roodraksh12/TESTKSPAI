"""Deterministic BNSS section 193 final-report preparation.

This module deliberately does not call an LLM. It builds a structured working
copy from records already stored for a case, revalidates every source link on
save, and keeps immutable versions for officer review and audit.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Iterable

import psycopg
from fastapi import HTTPException
from psycopg.types.json import Jsonb

from app.services import legal_sections, report_sources
from app.services.case_access import jurisdiction_filter_sql
from app.services.db import (
    fetch_all,
    fetch_one,
    get_conn,
    new_id,
    serialize_row,
)
from app.services.hierarchy import is_police_it

SCHEMA_VERSION = 2
FORMAT_VERSION = "BNSS193-STRUCTURED-V2"
REPORT_TYPE = "CHARGE_SHEET"
DEFAULT_TEMPLATE_PROFILE = "RAJASTHAN_IIF_IV_REFERENCE_V1"
DEFAULT_LEGAL_REGIME = "BNS_BNSS_2023"
EDITABLE_STATUSES = {"DRAFT", "RETURNED"}
REVIEWER_ROLES = {
    "DGP_IGP",
    "ADGP",
    "IGP",
    "DIG",
    "SP",
    "ADDL_SP_DCP",
    "ASP_ACP",
    "DYSP",
    "SHO",
    "INSPECTOR",
}

NARRATIVE_FIELDS = (
    "caseBackground",
    "informationReceived",
    "investigationConducted",
    "evidenceSummary",
    "conclusion",
    "prayer",
)

PROFILE_TEXT_FIELDS = (
    "alias",
    "parentName",
    "birthYear",
    "gender",
    "nationality",
    "occupation",
    "permanentAddress",
    "identityStatus",
    "identityType",
    "identityReference",
)

REPORT_METADATA_FIELDS = (
    "templateProfile",
    "legalRegime",
    "finalReportNumber",
    "finalReportDate",
    "reportCategory",
    "courtName",
    "filingPlace",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_text(value: Any, *, limit: int = 20_000) -> str:
    return str(value or "").strip()[:limit]


def _clean_int(value: Any, *, minimum: int = 0, maximum: int = 10_000) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return minimum
    return max(minimum, min(parsed, maximum))


def _person_profile(raw: dict[str, Any]) -> dict[str, str]:
    profile = {
        field: _clean_text(raw.get(field), limit=1_000 if "Address" in field else 300)
        for field in PROFILE_TEXT_FIELDS
    }
    profile["identityStatus"] = profile["identityStatus"] or "NOT_RECORDED"
    return profile


def _report_metadata(raw: dict[str, Any] | None = None) -> dict[str, str]:
    source = raw or {}
    defaults = {
        "templateProfile": DEFAULT_TEMPLATE_PROFILE,
        "legalRegime": DEFAULT_LEGAL_REGIME,
        "finalReportNumber": "",
        "finalReportDate": "",
        "reportCategory": "ORIGINAL",
        "courtName": "",
        "filingPlace": "",
    }
    return {
        field: _clean_text(source.get(field) or defaults[field], limit=500)
        for field in REPORT_METADATA_FIELDS
    }


def _catalog_rows() -> list[dict[str, Any]]:
    return [
        {
            "id": f"bns-{section.bns}",
            "actCode": "BNS",
            "sectionNumber": section.bns,
            "title": section.title,
            "punishment": section.punishment,
            "cognizable": section.cognizable,
            "bailable": section.bailable,
            "conditionNote": section.condition_note,
        }
        for section in legal_sections.SECTIONS
    ]


def _source_context(case_id: str, officer: dict[str, Any]) -> dict[str, Any] | None:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    case_row = fetch_one(
        f'''
        SELECT c.id, c."firNumber", c."stationId", c."crimeType", c.status,
               c."incidentDate", c."reportedDate", c.summary,
               c."currentIoId", ps.name AS "stationName", d.name AS "districtName",
               io.name AS "currentIoName", io."badgeId" AS "currentIoBadgeId"
        FROM "Case" c
        JOIN "PoliceStation" ps ON c."stationId" = ps.id
        JOIN "District" d ON ps."districtId" = d.id
        LEFT JOIN "Officer" io ON c."currentIoId" = io.id
        WHERE c.id = %(caseId)s{scope_sql}
        ''',
        {"caseId": case_id, **scope_params},
    )
    if not case_row:
        return None

    people = fetch_all(
        '''
        SELECT cp.id AS "casePersonId", cp."personId", cp.role,
               p.name, p.phone, p.address
        FROM "CasePerson" cp
        JOIN "Person" p ON cp."personId" = p.id
        WHERE cp."caseId" = %(caseId)s
        ORDER BY CASE cp.role WHEN 'ACCUSED' THEN 1 WHEN 'VICTIM' THEN 2 ELSE 3 END,
                 p.name
        ''',
        {"caseId": case_id},
    )
    evidence = fetch_all(
        '''
        SELECT e.id, e.type, e.description, e.status, e.timestamp,
               o.name AS "addedByName", o."badgeId" AS "addedByBadgeId"
        FROM "Evidence" e
        JOIN "Officer" o ON e."addedById" = o.id
        WHERE e."caseId" = %(caseId)s
        ORDER BY e.timestamp, e.id
        ''',
        {"caseId": case_id},
    )
    documents = fetch_all(
        '''
        SELECT d.id, d.name, d.metadata, d."createdAt", d."diaryEntryId", d."evidenceId"
        FROM "Document" d
        WHERE d."caseId" = %(caseId)s
        ORDER BY d."createdAt", d.id
        ''',
        {"caseId": case_id},
    )
    diary_entries = fetch_all(
        '''
        SELECT de.id, de."pageNumber", de."activityType", de.narrative, de.timestamp,
               o.name AS "authorName", o."badgeId" AS "authorBadgeId"
        FROM "CaseDiaryEntry" de
        JOIN "Officer" o ON de."authorId" = o.id
        WHERE de."caseId" = %(caseId)s
        ORDER BY de.timestamp, de.id
        ''',
        {"caseId": case_id},
    )
    custody_clocks: list[dict[str, Any]] = []
    try:
        custody_clocks = fetch_all(
            '''
            SELECT cc.*, cp."personId", p.name AS "personName"
            FROM "CaseCustodyClock" cc
            JOIN "CasePerson" cp ON cc."casePersonId" = cp.id
            JOIN "Person" p ON cp."personId" = p.id
            WHERE cc."caseId" = %(caseId)s
            ORDER BY cc."firstRemandAt", cc.id
            ''',
            {"caseId": case_id},
        )
    except psycopg.errors.UndefinedTable:
        custody_clocks = []

    prediction = legal_sections.predict_sections(case_row["crimeType"], case_row.get("summary"))
    context = {
        "case": case_row,
        "people": people,
        "accusedCandidates": [person for person in people if person["role"] == "ACCUSED"],
        "witnessCandidates": [person for person in people if person["role"] == "WITNESS"],
        "victims": [person for person in people if person["role"] == "VICTIM"],
        "evidence": evidence,
        "documents": documents,
        "diaryEntries": diary_entries,
        "custodyClocks": custody_clocks,
        "legalCatalog": _catalog_rows(),
        "suggestedLegalSections": prediction["predictions"],
        "legalDisclaimer": prediction["disclaimer"],
    }
    context["reportSources"] = report_sources.load_sources_for_report(case_id)
    return context


def _case_snapshot(context: dict[str, Any]) -> dict[str, Any]:
    case = context["case"]
    return {
        "caseId": case["id"],
        "firNumber": case["firNumber"],
        "stationId": case["stationId"],
        "stationName": case["stationName"],
        "districtName": case["districtName"],
        "crimeType": case["crimeType"],
        "caseStatus": case["status"],
        "incidentDate": case["incidentDate"],
        "reportedDate": case["reportedDate"],
        "summary": case.get("summary") or "",
        "currentIoId": case.get("currentIoId"),
        "currentIoName": case.get("currentIoName"),
        "currentIoBadgeId": case.get("currentIoBadgeId"),
    }


def _initial_payload(context: dict[str, Any]) -> dict[str, Any]:
    clock_by_case_person = {row["casePersonId"]: row for row in context["custodyClocks"]}
    accused = []
    for person in context["accusedCandidates"]:
        clock = clock_by_case_person.get(person["casePersonId"])
        accused.append(
            {
                "key": person["casePersonId"],
                "sourceCasePersonId": person["casePersonId"],
                "sourcePersonId": person["personId"],
                "selected": True,
                "name": person["name"],
                "phone": person.get("phone") or "",
                "address": person.get("address") or "",
                "custodyStatus": "REMANDED" if clock else "NOT_RECORDED",
                "firstRemandAt": clock.get("firstRemandAt") if clock else None,
                "bailStatus": "NOT_RECORDED",
                "allegation": "",
                "disposition": "CHARGE_SHEETED",
                "dispositionReason": "",
                "arrestAt": "",
                "bailAt": "",
                "forwardedToCourtAt": "",
                "regularCriminalNumber": "",
                "previousConvictions": "",
                "suretyDetails": "",
                **_person_profile({}),
                "isManual": False,
            }
        )

    witnesses = [
        {
            "key": person["casePersonId"],
            "sourceCasePersonId": person["casePersonId"],
            "sourcePersonId": person["personId"],
            "selected": False,
            "name": person["name"],
            "phone": person.get("phone") or "",
            "address": person.get("address") or "",
            "statementSummary": "",
            "evidenceType": "ORAL",
            "relationshipName": "",
            "birthYear": "",
            "occupation": "",
            "isManual": False,
        }
        for person in context["witnessCandidates"]
    ]
    evidence = [
        {
            "key": row["id"],
            "sourceEvidenceId": row["id"],
            "selected": False,
            "type": row["type"],
            "description": row["description"],
            "status": row["status"],
            "timestamp": row["timestamp"],
            "resultStatus": "NOT_RECORDED",
            "resultSummary": "",
            "referenceNumber": "",
        }
        for row in context["evidence"]
    ]
    documents = [
        {
            "key": row["id"],
            "sourceDocumentId": row["id"],
            "selected": False,
            "name": row["name"],
            "metadata": row.get("metadata") or {},
            "createdAt": row["createdAt"],
            "category": "OTHER",
            "sequenceNumber": index,
            "annexureNumber": str(index),
            "pageCount": 1,
            "copyType": "COPY_STATUS_NOT_RECORDED",
            "description": "",
        }
        for index, row in enumerate(context["documents"], 1)
    ]
    suggested_ids = {row["id"] for row in context["suggestedLegalSections"]}
    offences = [
        {
            "key": row["id"],
            "catalogId": row["id"],
            "selected": False,
            "suggested": row["id"] in suggested_ids,
            "actCode": row["actCode"],
            "sectionNumber": row["sectionNumber"],
            "title": row["title"],
            "punishment": row["punishment"],
            "conditionNote": row.get("conditionNote") or "",
            "firStage": "NOT_RECORDED",
            "finalDecision": "NOT_RECORDED",
            "decisionReason": "",
            "approvalReference": "",
            "isManual": False,
        }
        for row in context["legalCatalog"]
    ]
    diary_lines = [
        f'{entry["timestamp"][:10]} - {entry["activityType"]}: {entry["narrative"]}'
        for entry in context["diaryEntries"]
    ]
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "reportMetadata": _report_metadata(),
        "caseDetails": _case_snapshot(context),
        "complainant": {
            "sourceCasePersonId": None,
            "sourcePersonId": None,
            "name": "",
            "phone": "",
            "address": "",
            "relationshipToVictim": "",
            "verificationStatus": "NOT_RECORDED",
            "isManual": True,
        },
        "victims": [
            {
                "key": person["casePersonId"],
                "sourceCasePersonId": person["casePersonId"],
                "sourcePersonId": person["personId"],
                "selected": True,
                "name": person["name"],
                "phone": person.get("phone") or "",
                "address": person.get("address") or "",
                "injuryOrLoss": "",
                "isManual": False,
            }
            for person in context["victims"]
        ],
        "accused": accused,
        "offences": offences,
        "witnesses": witnesses,
        "evidence": evidence,
        "documents": documents,
        "propertyItems": [],
        "expertResults": [],
        "allegationMatrix": [],
        "narrative": {
            "caseBackground": context["case"].get("summary") or "",
            "informationReceived": (
                f'Information was recorded as {context["case"]["firNumber"]} at '
                f'{context["case"]["stationName"]} Police Station.'
            ),
            "investigationConducted": "\n".join(diary_lines),
            "evidenceSummary": "",
            "conclusion": "",
            "prayer": "Submitted to the competent Court for consideration under section 193 of the BNSS.",
        },
        "issueExplanations": {},
        "officerDeclaration": False,
        "preparedAt": _now_iso(),
    }
    return merge_case_sources(
        payload,
        context.get("reportSources"),
        overwrite_defaults=True,
    )


def _source_value(target: dict[str, Any], field: str, value: Any, *, overwrite_defaults: bool) -> None:
    if value in (None, ""):
        return
    current = target.get(field)
    if overwrite_defaults or current in (None, "", "NOT_RECORDED"):
        target[field] = value


def merge_case_sources(
    payload: dict[str, Any],
    sources: dict[str, Any] | None,
    *,
    overwrite_defaults: bool = False,
) -> dict[str, Any]:
    """Merge normalized investigation facts without replacing officer-authored text."""
    merged = deepcopy(payload)
    if not sources or int(sources.get("revision") or 0) <= 0:
        return merged
    merged["sourceRevision"] = int(sources.get("revision") or 0)

    profiles = {row["casePersonId"]: row for row in sources.get("parties") or []}
    existing_party_ids = {
        row.get("sourceCasePersonId")
        for collection in ("victims", "accused", "witnesses")
        for row in merged.get(collection) or []
    }
    for source in profiles.values():
        if source["casePersonId"] in existing_party_ids:
            continue
        common = {
            "key": source["casePersonId"],
            "sourceCasePersonId": source["casePersonId"],
            "sourcePersonId": source.get("personId"),
            "name": source.get("name") or "",
            "phone": source.get("phone") or "",
            "address": source.get("address") or "",
            "isManual": False,
        }
        if source.get("role") == "VICTIM":
            merged.setdefault("victims", []).append({**common, "selected": True, "injuryOrLoss": source.get("injuryOrLoss") or ""})
        elif source.get("role") == "WITNESS":
            merged.setdefault("witnesses", []).append(
                {
                    **common,
                    "selected": False,
                    "statementSummary": source.get("statementSummary") or "",
                    "evidenceType": source.get("evidenceType") or "ORAL",
                    "relationshipName": source.get("relationshipToVictim") or "",
                    "birthYear": source.get("birthYear") or "",
                    "occupation": source.get("occupation") or "",
                }
            )
        elif source.get("role") == "ACCUSED":
            merged.setdefault("accused", []).append(
                {
                    **common,
                    "selected": source.get("disposition") == "CHARGE_SHEETED",
                    "custodyStatus": "NOT_RECORDED",
                    "firstRemandAt": None,
                    "bailStatus": source.get("bailStatus") or "NOT_RECORDED",
                    "allegation": "",
                    "disposition": source.get("disposition") or "NOT_RECORDED",
                    "dispositionReason": source.get("dispositionReason") or "",
                    "arrestAt": "",
                    "bailAt": "",
                    "forwardedToCourtAt": "",
                    "regularCriminalNumber": source.get("regularCriminalNumber") or "",
                    "previousConvictions": source.get("previousConvictions") or "",
                    "suretyDetails": source.get("suretyDetails") or "",
                    **_person_profile(source),
                }
            )
    complainant_profile = next((row for row in profiles.values() if row.get("isComplainant")), None)
    if complainant_profile:
        complainant = merged.setdefault("complainant", {})
        if overwrite_defaults or (
            not complainant.get("sourceCasePersonId") and not _clean_text(complainant.get("name"), limit=300)
        ):
            complainant.update(
                {
                    "sourceCasePersonId": complainant_profile["casePersonId"],
                    "sourcePersonId": complainant_profile.get("personId"),
                    "name": complainant_profile.get("name") or "",
                    "phone": complainant_profile.get("phone") or "",
                    "address": complainant_profile.get("address") or "",
                    "isManual": False,
                }
            )
        if complainant.get("sourceCasePersonId") == complainant_profile["casePersonId"]:
            _source_value(complainant, "relationshipToVictim", complainant_profile.get("relationshipToVictim"), overwrite_defaults=overwrite_defaults)
            _source_value(complainant, "verificationStatus", complainant_profile.get("identityStatus"), overwrite_defaults=overwrite_defaults)

    for collection in ("victims", "accused", "witnesses"):
        for row in merged.get(collection) or []:
            source = profiles.get(row.get("sourceCasePersonId"))
            if not source:
                continue
            common_fields = (
                "alias", "parentName", "birthYear", "gender", "nationality", "occupation",
                "permanentAddress", "identityStatus", "identityType", "identityReference",
            )
            for field in common_fields:
                _source_value(row, field, source.get(field), overwrite_defaults=overwrite_defaults)
            if collection == "victims":
                _source_value(row, "injuryOrLoss", source.get("injuryOrLoss"), overwrite_defaults=overwrite_defaults)
            elif collection == "witnesses":
                _source_value(row, "statementSummary", source.get("statementSummary"), overwrite_defaults=overwrite_defaults)
                _source_value(row, "evidenceType", source.get("evidenceType"), overwrite_defaults=overwrite_defaults)
                _source_value(row, "relationshipName", source.get("relationshipToVictim"), overwrite_defaults=overwrite_defaults)
            else:
                for field in (
                    "disposition", "dispositionReason", "bailStatus", "regularCriminalNumber",
                    "previousConvictions", "suretyDetails",
                ):
                    _source_value(row, field, source.get(field), overwrite_defaults=overwrite_defaults)
                if overwrite_defaults and source.get("disposition") in {"CHARGE_SHEETED", "NOT_CHARGE_SHEETED"}:
                    row["selected"] = source["disposition"] == "CHARGE_SHEETED"

    events_by_person: dict[str, list[dict[str, Any]]] = {}
    for event in sources.get("events") or []:
        events_by_person.setdefault(event["casePersonId"], []).append(event)
    event_field = {
        "ARRESTED": "arrestAt",
        "FORWARDED_TO_COURT": "forwardedToCourtAt",
        "BAIL_GRANTED": "bailAt",
        "RELEASED_ON_BAIL": "bailAt",
    }
    for accused in merged.get("accused") or []:
        events = sorted(events_by_person.get(accused.get("sourceCasePersonId"), []), key=lambda row: row.get("occurredAt") or "")
        for event in events:
            field = event_field.get(event.get("eventType"))
            if field:
                _source_value(accused, field, event.get("occurredAt"), overwrite_defaults=overwrite_defaults)

    offences = merged.setdefault("offences", [])
    for source in sources.get("legalSections") or []:
        existing = next(
            (
                row for row in offences
                if (source.get("catalogId") and row.get("catalogId") == source.get("catalogId"))
                or (
                    str(row.get("actCode") or "").upper() == str(source.get("actCode") or "").upper()
                    and str(row.get("sectionNumber") or "") == str(source.get("sectionNumber") or "")
                )
            ),
            None,
        )
        if not existing:
            existing = {
                "key": source["id"],
                "catalogId": source.get("catalogId"),
                "selected": source.get("finalDecision") in {"RETAINED", "ADDED"},
                "suggested": False,
                "actCode": source.get("actCode") or "",
                "sectionNumber": source.get("sectionNumber") or "",
                "title": source.get("title") or "",
                "punishment": source.get("punishment") or "",
                "conditionNote": source.get("conditionNote") or "",
                "firStage": "ALLEGED" if source.get("initiallyAlleged") else "NOT_ALLEGED",
                "finalDecision": source.get("finalDecision") or "NOT_RECORDED",
                "decisionReason": source.get("decisionReason") or "",
                "approvalReference": source.get("approvalReference") or "",
                "isManual": not bool(source.get("catalogId")),
            }
            offences.append(existing)
            continue
        for field, value in (
            ("firStage", "ALLEGED" if source.get("initiallyAlleged") else "NOT_ALLEGED"),
            ("finalDecision", source.get("finalDecision")),
            ("decisionReason", source.get("decisionReason")),
            ("approvalReference", source.get("approvalReference")),
        ):
            _source_value(existing, field, value, overwrite_defaults=overwrite_defaults)
        if overwrite_defaults:
            existing["selected"] = source.get("finalDecision") in {"RETAINED", "ADDED"}

    evidence_by_id = {row.get("sourceEvidenceId"): row for row in merged.get("evidence") or []}
    for source in sources.get("evidenceAssessments") or []:
        existing = evidence_by_id.get(source.get("evidenceId"))
        if not existing:
            continue
        for field in ("resultStatus", "resultSummary", "referenceNumber"):
            _source_value(existing, field, source.get(field), overwrite_defaults=overwrite_defaults)

    for collection, source_collection, key_name in (
        ("propertyItems", "propertyItems", "id"),
        ("expertResults", "expertResults", "id"),
    ):
        target_rows = merged.setdefault(collection, [])
        by_key = {row.get("key"): row for row in target_rows}
        for source in sources.get(source_collection) or []:
            existing = by_key.get(source[key_name])
            if not existing:
                existing = {"key": source[key_name], "selected": True} if collection == "propertyItems" else {"key": source[key_name]}
                target_rows.append(existing)
            for field, value in source.items():
                if field in {"id", "caseId", "createdById", "updatedById", "createdAt", "updatedAt"}:
                    continue
                _source_value(existing, field, value, overwrite_defaults=overwrite_defaults)
    return merged


def _selected(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in rows if row.get("selected")]


def upgrade_payload(payload: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Upgrade a saved Phase 1 working copy without changing its source records."""
    upgraded = deepcopy(payload or {})
    if _clean_int(upgraded.get("schemaVersion"), minimum=1) >= SCHEMA_VERSION:
        return upgraded

    upgraded["schemaVersion"] = SCHEMA_VERSION
    upgraded.setdefault("sourceRevision", int((context.get("reportSources") or {}).get("revision") or 0))
    upgraded["reportMetadata"] = _report_metadata(upgraded.get("reportMetadata"))
    upgraded.setdefault(
        "complainant",
        {
            "sourceCasePersonId": None,
            "sourcePersonId": None,
            "name": "",
            "phone": "",
            "address": "",
            "relationshipToVictim": "",
            "verificationStatus": "NOT_RECORDED",
            "isManual": True,
        },
    )
    upgraded.setdefault(
        "victims",
        [
            {
                "key": person["casePersonId"],
                "sourceCasePersonId": person["casePersonId"],
                "sourcePersonId": person["personId"],
                "selected": True,
                "name": person["name"],
                "phone": person.get("phone") or "",
                "address": person.get("address") or "",
                "injuryOrLoss": "",
                "isManual": False,
            }
            for person in context.get("victims", [])
        ],
    )
    upgraded.setdefault("propertyItems", [])
    upgraded.setdefault("expertResults", [])

    for row in upgraded.get("accused") or []:
        row.setdefault("disposition", "CHARGE_SHEETED" if row.get("selected") else "NOT_SELECTED")
        for field in (
            "dispositionReason",
            "arrestAt",
            "bailAt",
            "forwardedToCourtAt",
            "regularCriminalNumber",
            "previousConvictions",
            "suretyDetails",
            *PROFILE_TEXT_FIELDS,
        ):
            row.setdefault(field, "")
    for row in upgraded.get("witnesses") or []:
        row.setdefault("evidenceType", "ORAL")
        row.setdefault("relationshipName", "")
        row.setdefault("birthYear", "")
        row.setdefault("occupation", "")
    for row in upgraded.get("evidence") or []:
        row.setdefault("resultStatus", "NOT_RECORDED")
        row.setdefault("resultSummary", "")
        row.setdefault("referenceNumber", "")
    for index, row in enumerate(upgraded.get("documents") or [], 1):
        row.setdefault("sequenceNumber", index)
        row.setdefault("annexureNumber", str(index))
        row.setdefault("pageCount", 1)
        row.setdefault("copyType", "COPY_STATUS_NOT_RECORDED")
        row.setdefault("description", "")
    for row in upgraded.get("offences") or []:
        row.setdefault("firStage", "NOT_RECORDED")
        row.setdefault("finalDecision", "NOT_RECORDED")
        row.setdefault("decisionReason", "")
        row.setdefault("approvalReference", "")
    return upgraded


def normalize_payload(payload: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Re-resolve all source-linked records inside the route-scoped case."""
    payload = upgrade_payload(payload, context)
    candidate_by_id = {row["casePersonId"]: row for row in context["people"]}
    evidence_by_id = {row["id"]: row for row in context["evidence"]}
    document_by_id = {row["id"]: row for row in context["documents"]}
    catalog_by_id = {row["id"]: row for row in context["legalCatalog"]}
    clock_by_case_person = {row["casePersonId"]: row for row in context["custodyClocks"]}

    normalized: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "sourceRevision": _clean_int(payload.get("sourceRevision"), minimum=0, maximum=1_000_000_000),
        "reportType": REPORT_TYPE,
        "reportMetadata": _report_metadata(payload.get("reportMetadata")),
        "caseDetails": _case_snapshot(context),
        "complainant": {},
        "victims": [],
        "accused": [],
        "offences": [],
        "witnesses": [],
        "evidence": [],
        "documents": [],
        "propertyItems": [],
        "expertResults": [],
        "allegationMatrix": [],
        "narrative": {},
        "issueExplanations": {},
        "officerDeclaration": bool(payload.get("officerDeclaration")),
        "preparedAt": payload.get("preparedAt") or _now_iso(),
    }

    raw_complainant = dict(payload.get("complainant") or {})
    complainant_source_id = raw_complainant.get("sourceCasePersonId")
    complainant_source = candidate_by_id.get(complainant_source_id) if complainant_source_id else None
    if complainant_source_id and not complainant_source:
        raise HTTPException(status_code=400, detail="The complainant source does not belong to this case")
    normalized["complainant"] = {
        "sourceCasePersonId": complainant_source_id,
        "sourcePersonId": complainant_source.get("personId") if complainant_source else None,
        "name": complainant_source["name"] if complainant_source else _clean_text(raw_complainant.get("name"), limit=300),
        "phone": (complainant_source.get("phone") or "") if complainant_source else _clean_text(raw_complainant.get("phone"), limit=100),
        "address": (complainant_source.get("address") or "") if complainant_source else _clean_text(raw_complainant.get("address"), limit=1_000),
        "relationshipToVictim": _clean_text(raw_complainant.get("relationshipToVictim"), limit=300),
        "verificationStatus": _clean_text(raw_complainant.get("verificationStatus"), limit=100) or "NOT_RECORDED",
        "isManual": complainant_source is None,
    }

    seen_victim_keys: set[str] = set()
    for raw in list(payload.get("victims") or [])[:100]:
        source_id = raw.get("sourceCasePersonId")
        source = candidate_by_id.get(source_id) if source_id else None
        if source_id and (not source or source["role"] != "VICTIM"):
            raise HTTPException(status_code=400, detail="A victim source does not belong to this case")
        key = str(source_id or raw.get("key") or new_id())[:100]
        if key in seen_victim_keys:
            continue
        seen_victim_keys.add(key)
        normalized["victims"].append(
            {
                "key": key,
                "sourceCasePersonId": source_id,
                "sourcePersonId": source.get("personId") if source else None,
                "selected": bool(raw.get("selected")),
                "name": source["name"] if source else _clean_text(raw.get("name"), limit=300),
                "phone": (source.get("phone") or "") if source else _clean_text(raw.get("phone"), limit=100),
                "address": (source.get("address") or "") if source else _clean_text(raw.get("address"), limit=1_000),
                "injuryOrLoss": _clean_text(raw.get("injuryOrLoss"), limit=4_000),
                "isManual": source is None,
            }
        )

    seen_keys: set[str] = set()
    for raw in list(payload.get("accused") or [])[:100]:
        source_id = raw.get("sourceCasePersonId")
        source = candidate_by_id.get(source_id) if source_id else None
        if source_id and (not source or source["role"] != "ACCUSED"):
            raise HTTPException(status_code=400, detail="An accused source does not belong to this case")
        key = str(source_id or raw.get("key") or new_id())[:100]
        if key in seen_keys:
            continue
        seen_keys.add(key)
        clock = clock_by_case_person.get(source_id) if source_id else None
        normalized["accused"].append(
            {
                "key": key,
                "sourceCasePersonId": source_id,
                "sourcePersonId": source.get("personId") if source else None,
                "selected": bool(raw.get("selected")),
                "name": source["name"] if source else _clean_text(raw.get("name"), limit=300),
                "phone": (source.get("phone") or "") if source else _clean_text(raw.get("phone"), limit=100),
                "address": (source.get("address") or "") if source else _clean_text(raw.get("address"), limit=1_000),
                "custodyStatus": _clean_text(raw.get("custodyStatus"), limit=100) or ("REMANDED" if clock else "NOT_RECORDED"),
                "firstRemandAt": clock.get("firstRemandAt") if clock else None,
                "bailStatus": _clean_text(raw.get("bailStatus"), limit=100) or "NOT_RECORDED",
                "allegation": _clean_text(raw.get("allegation")),
                "disposition": _clean_text(raw.get("disposition"), limit=100) or ("CHARGE_SHEETED" if raw.get("selected") else "NOT_SELECTED"),
                "dispositionReason": _clean_text(raw.get("dispositionReason"), limit=4_000),
                "arrestAt": _clean_text(raw.get("arrestAt"), limit=100),
                "bailAt": _clean_text(raw.get("bailAt"), limit=100),
                "forwardedToCourtAt": _clean_text(raw.get("forwardedToCourtAt"), limit=100),
                "regularCriminalNumber": _clean_text(raw.get("regularCriminalNumber"), limit=300),
                "previousConvictions": _clean_text(raw.get("previousConvictions"), limit=4_000),
                "suretyDetails": _clean_text(raw.get("suretyDetails"), limit=4_000),
                **_person_profile(raw),
                "isManual": source is None,
            }
        )

    seen_keys.clear()
    for raw in list(payload.get("witnesses") or [])[:200]:
        source_id = raw.get("sourceCasePersonId")
        source = candidate_by_id.get(source_id) if source_id else None
        if source_id and (not source or source["role"] != "WITNESS"):
            raise HTTPException(status_code=400, detail="A witness source does not belong to this case")
        key = str(source_id or raw.get("key") or new_id())[:100]
        if key in seen_keys:
            continue
        seen_keys.add(key)
        normalized["witnesses"].append(
            {
                "key": key,
                "sourceCasePersonId": source_id,
                "sourcePersonId": source.get("personId") if source else None,
                "selected": bool(raw.get("selected")),
                "name": source["name"] if source else _clean_text(raw.get("name"), limit=300),
                "phone": (source.get("phone") or "") if source else _clean_text(raw.get("phone"), limit=100),
                "address": (source.get("address") or "") if source else _clean_text(raw.get("address"), limit=1_000),
                "statementSummary": _clean_text(raw.get("statementSummary")),
                "evidenceType": _clean_text(raw.get("evidenceType"), limit=100) or "ORAL",
                "relationshipName": _clean_text(raw.get("relationshipName"), limit=300),
                "birthYear": _clean_text(raw.get("birthYear"), limit=20),
                "occupation": _clean_text(raw.get("occupation"), limit=300),
                "isManual": source is None,
            }
        )

    for raw in list(payload.get("evidence") or [])[:500]:
        source_id = raw.get("sourceEvidenceId")
        source = evidence_by_id.get(source_id)
        if not source:
            raise HTTPException(status_code=400, detail="An evidence source does not belong to this case")
        normalized["evidence"].append(
            {
                "key": source_id,
                "sourceEvidenceId": source_id,
                "selected": bool(raw.get("selected")),
                "type": source["type"],
                "description": source["description"],
                "status": source["status"],
                "timestamp": source["timestamp"],
                "resultStatus": _clean_text(raw.get("resultStatus"), limit=100) or "NOT_RECORDED",
                "resultSummary": _clean_text(raw.get("resultSummary"), limit=4_000),
                "referenceNumber": _clean_text(raw.get("referenceNumber"), limit=300),
            }
        )

    for raw in list(payload.get("documents") or [])[:500]:
        source_id = raw.get("sourceDocumentId")
        source = document_by_id.get(source_id)
        if not source:
            raise HTTPException(status_code=400, detail="A document source does not belong to this case")
        normalized["documents"].append(
            {
                "key": source_id,
                "sourceDocumentId": source_id,
                "selected": bool(raw.get("selected")),
                "name": source["name"],
                "metadata": source.get("metadata") or {},
                "createdAt": source["createdAt"],
                "category": _clean_text(raw.get("category"), limit=100) or "OTHER",
                "sequenceNumber": _clean_int(raw.get("sequenceNumber"), minimum=1, maximum=10_000),
                "annexureNumber": _clean_text(raw.get("annexureNumber"), limit=100),
                "pageCount": _clean_int(raw.get("pageCount"), minimum=1, maximum=10_000),
                "copyType": _clean_text(raw.get("copyType"), limit=100) or "COPY_STATUS_NOT_RECORDED",
                "description": _clean_text(raw.get("description"), limit=2_000),
            }
        )

    seen_keys.clear()
    for raw in list(payload.get("propertyItems") or [])[:500]:
        source_evidence_id = raw.get("sourceEvidenceId")
        if source_evidence_id and source_evidence_id not in evidence_by_id:
            raise HTTPException(status_code=400, detail="A property evidence source does not belong to this case")
        key = str(raw.get("key") or new_id())[:100]
        if key in seen_keys:
            continue
        seen_keys.add(key)
        normalized["propertyItems"].append(
            {
                "key": key,
                "selected": bool(raw.get("selected", True)),
                "sourceEvidenceId": source_evidence_id,
                "category": _clean_text(raw.get("category"), limit=100) or "OTHER",
                "description": _clean_text(raw.get("description"), limit=2_000),
                "quantity": _clean_text(raw.get("quantity"), limit=100),
                "estimatedValue": _clean_text(raw.get("estimatedValue"), limit=100),
                "recoveryStatus": _clean_text(raw.get("recoveryStatus"), limit=100) or "NOT_RECORDED",
                "recoveredAt": _clean_text(raw.get("recoveredAt"), limit=100),
                "seizureMemoReference": _clean_text(raw.get("seizureMemoReference"), limit=300),
                "disposalStatus": _clean_text(raw.get("disposalStatus"), limit=100) or "NOT_RECORDED",
            }
        )

    seen_keys.clear()
    for raw in list(payload.get("expertResults") or [])[:200]:
        source_document_id = raw.get("sourceDocumentId")
        if source_document_id and source_document_id not in document_by_id:
            raise HTTPException(status_code=400, detail="An expert-result document source does not belong to this case")
        key = str(raw.get("key") or new_id())[:100]
        if key in seen_keys:
            continue
        seen_keys.add(key)
        normalized["expertResults"].append(
            {
                "key": key,
                "sourceDocumentId": source_document_id,
                "type": _clean_text(raw.get("type"), limit=100) or "OTHER",
                "status": _clean_text(raw.get("status"), limit=100) or "NOT_RECORDED",
                "referenceNumber": _clean_text(raw.get("referenceNumber"), limit=300),
                "resultDate": _clean_text(raw.get("resultDate"), limit=100),
                "summary": _clean_text(raw.get("summary"), limit=4_000),
            }
        )

    seen_keys.clear()
    for raw in list(payload.get("offences") or [])[:100]:
        catalog_id = raw.get("catalogId")
        source = catalog_by_id.get(catalog_id) if catalog_id else None
        key = str(catalog_id or raw.get("key") or new_id())[:100]
        if key in seen_keys:
            continue
        seen_keys.add(key)
        normalized["offences"].append(
            {
                "key": key,
                "catalogId": catalog_id if source else None,
                "selected": bool(raw.get("selected")),
                "suggested": bool(raw.get("suggested")),
                "actCode": source["actCode"] if source else _clean_text(raw.get("actCode"), limit=100),
                "sectionNumber": source["sectionNumber"] if source else _clean_text(raw.get("sectionNumber"), limit=100),
                "title": source["title"] if source else _clean_text(raw.get("title"), limit=500),
                "punishment": source["punishment"] if source else _clean_text(raw.get("punishment"), limit=1_000),
                "conditionNote": source.get("conditionNote", "") if source else _clean_text(raw.get("conditionNote"), limit=2_000),
                "firStage": _clean_text(raw.get("firStage"), limit=100) or "NOT_RECORDED",
                "finalDecision": _clean_text(raw.get("finalDecision"), limit=100) or "NOT_RECORDED",
                "decisionReason": _clean_text(raw.get("decisionReason"), limit=4_000),
                "approvalReference": _clean_text(raw.get("approvalReference"), limit=500),
                "isManual": source is None,
            }
        )

    accused_keys = {row["key"] for row in normalized["accused"]}
    offence_keys = {row["key"] for row in normalized["offences"]}
    evidence_keys = {row["key"] for row in normalized["evidence"]}
    witness_keys = {row["key"] for row in normalized["witnesses"]}
    seen_matrix: set[tuple[str, str]] = set()
    for raw in list(payload.get("allegationMatrix") or [])[:500]:
        accused_key = str(raw.get("accusedKey") or "")[:100]
        offence_key = str(raw.get("offenceKey") or "")[:100]
        pair = (accused_key, offence_key)
        if accused_key not in accused_keys or offence_key not in offence_keys or pair in seen_matrix:
            continue
        seen_matrix.add(pair)
        normalized["allegationMatrix"].append(
            {
                "key": str(raw.get("key") or f"{accused_key}:{offence_key}")[:220],
                "accusedKey": accused_key,
                "offenceKey": offence_key,
                "facts": _clean_text(raw.get("facts")),
                "evidenceKeys": [key for key in dict.fromkeys(raw.get("evidenceKeys") or []) if key in evidence_keys],
                "witnessKeys": [key for key in dict.fromkeys(raw.get("witnessKeys") or []) if key in witness_keys],
            }
        )

    incoming_narrative = payload.get("narrative") or {}
    normalized["narrative"] = {
        field: _clean_text(incoming_narrative.get(field)) for field in NARRATIVE_FIELDS
    }
    normalized["issueExplanations"] = {
        _clean_text(key, limit=300): _clean_text(value, limit=4_000)
        for key, value in dict(payload.get("issueExplanations") or {}).items()
        if _clean_text(key, limit=300)
    }
    return normalized


def validate_payload(payload: dict[str, Any]) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []

    explanations = payload.get("issueExplanations") or {}
    schema_version = _clean_int(payload.get("schemaVersion"), minimum=1)

    def add(code: str, severity: str, message: str, path: str) -> None:
        issue_key = f"{code}:{path}"
        issues.append(
            {
                "key": issue_key,
                "code": code,
                "severity": severity,
                "message": message,
                "path": path,
                "explanation": _clean_text(explanations.get(issue_key), limit=4_000),
            }
        )

    accused = _selected(payload.get("accused") or [])
    offences = _selected(payload.get("offences") or [])
    witnesses = _selected(payload.get("witnesses") or [])
    evidence = _selected(payload.get("evidence") or [])
    documents = _selected(payload.get("documents") or [])
    matrix = payload.get("allegationMatrix") or []
    selected_accused_keys = {row["key"] for row in accused}
    selected_offence_keys = {row["key"] for row in offences}
    selected_evidence_keys = {row["key"] for row in evidence}
    selected_witness_keys = {row["key"] for row in witnesses}

    if schema_version >= 2:
        metadata = payload.get("reportMetadata") or {}
        for field, label in (
            ("finalReportNumber", "final report / charge-sheet number"),
            ("finalReportDate", "final report date"),
            ("courtName", "receiving Court"),
        ):
            if not metadata.get(field):
                add("REPORT_METADATA_REQUIRED", "ERROR", f"Record the {label}.", f"reportMetadata.{field}")
        if not (payload.get("complainant") or {}).get("name"):
            add("COMPLAINANT_REQUIRED", "ERROR", "Record the complainant or informant shown in the FIR.", "complainant.name")
        if not _selected(payload.get("victims") or []):
            add("NO_VICTIM_SELECTED", "EXPLANATION", "No victim is selected; confirm whether the complainant and victim are the same or no separate victim applies.", "victims")

    if not accused:
        add("ACCUSED_REQUIRED", "ERROR", "Select at least one accused being sent for trial.", "accused")
    for row in accused:
        if not row.get("name"):
            add("ACCUSED_NAME_REQUIRED", "ERROR", "Every selected accused requires a name.", f'accused.{row["key"]}.name')
        if not row.get("allegation"):
            add("ACCUSED_ALLEGATION_REQUIRED", "ERROR", f'Record the allegation against {row.get("name") or "the accused"}.', f'accused.{row["key"]}.allegation')
        if row.get("custodyStatus") == "NOT_RECORDED":
            add("CUSTODY_STATUS_MISSING", "EXPLANATION", f'Custody/remand status is not recorded for {row.get("name") or "an accused"}.', f'accused.{row["key"]}.custodyStatus')
        if schema_version >= 2 and row.get("disposition") != "CHARGE_SHEETED":
            add("ACCUSED_DISPOSITION_MISMATCH", "ERROR", f'{row.get("name") or "The accused"} is selected for trial but is not marked charge-sheeted.', f'accused.{row["key"]}.disposition')
        if schema_version >= 2 and row.get("identityStatus") == "NOT_RECORDED":
            add("ACCUSED_IDENTITY_UNVERIFIED", "EXPLANATION", f'Identity verification is not recorded for {row.get("name") or "an accused"}.', f'accused.{row["key"]}.identityStatus')

    if schema_version >= 2:
        for row in payload.get("accused") or []:
            if row.get("selected"):
                continue
            if row.get("disposition") == "NOT_CHARGE_SHEETED" and not row.get("dispositionReason"):
                add("NON_CHARGESHEETED_REASON_REQUIRED", "ERROR", f'Record why {row.get("name") or "an accused"} is not charge-sheeted.', f'accused.{row["key"]}.dispositionReason')

    if not offences:
        add("OFFENCE_REQUIRED", "ERROR", "Select at least one alleged Act and section.", "offences")
    for row in offences:
        if not row.get("actCode") or not row.get("sectionNumber") or not row.get("title"):
            add("OFFENCE_DETAILS_REQUIRED", "ERROR", "Every selected offence requires an Act, section and title.", f'offences.{row["key"]}')
        if schema_version >= 2 and row.get("finalDecision") not in {"RETAINED", "ADDED"}:
            add("FINAL_SECTION_DECISION_REQUIRED", "ERROR", f'Record whether {row.get("actCode")} {row.get("sectionNumber")} was retained or added after investigation.', f'offences.{row["key"]}.finalDecision')

    if schema_version >= 2:
        for row in payload.get("offences") or []:
            if row.get("finalDecision") == "DROPPED" and not row.get("decisionReason"):
                add("DROPPED_SECTION_REASON_REQUIRED", "ERROR", f'Record why {row.get("actCode")} {row.get("sectionNumber")} was dropped.', f'offences.{row["key"]}.decisionReason')

    valid_matrix = [
        row for row in matrix
        if row.get("accusedKey") in selected_accused_keys and row.get("offenceKey") in selected_offence_keys
    ]
    for accused_row in accused:
        if not any(row.get("accusedKey") == accused_row["key"] and row.get("facts") for row in valid_matrix):
            add("ACCUSED_SECTION_LINK_REQUIRED", "ERROR", f'Link {accused_row["name"]} to at least one selected section with supporting facts.', "allegationMatrix")
    for offence in offences:
        if not any(row.get("offenceKey") == offence["key"] and row.get("facts") for row in valid_matrix):
            add("SECTION_FACTS_REQUIRED", "ERROR", f'Link {offence["actCode"]} {offence["sectionNumber"]} to an accused and supporting facts.', "allegationMatrix")
    for row in valid_matrix:
        if any(key not in selected_evidence_keys for key in row.get("evidenceKeys") or []):
            add("UNSELECTED_EVIDENCE_LINK", "ERROR", "An allegation links evidence that is not selected for the report.", f'allegationMatrix.{row["key"]}.evidenceKeys')
        if any(key not in selected_witness_keys for key in row.get("witnessKeys") or []):
            add("UNSELECTED_WITNESS_LINK", "ERROR", "An allegation links a witness that is not selected for the report.", f'allegationMatrix.{row["key"]}.witnessKeys')

    if not witnesses:
        add("NO_WITNESSES_SELECTED", "EXPLANATION", "No prosecution witnesses are selected; record why before submission.", "witnesses")
    if not evidence:
        add("NO_EVIDENCE_SELECTED", "EXPLANATION", "No evidence records are selected; confirm whether the report relies only on statements/documents.", "evidence")
    if not documents:
        add("NO_DOCUMENTS_SELECTED", "EXPLANATION", "No documents are selected for the indexed filing packet.", "documents")
    if schema_version >= 2:
        annexure_numbers: set[str] = set()
        sequence_numbers: set[int] = set()
        for row in documents:
            sequence = _clean_int(row.get("sequenceNumber"), minimum=1)
            annexure = _clean_text(row.get("annexureNumber"), limit=100)
            if sequence in sequence_numbers:
                add("DUPLICATE_ANNEXURE_SEQUENCE", "ERROR", "Selected annexures must have unique serial order numbers.", f'documents.{row["key"]}.sequenceNumber')
            sequence_numbers.add(sequence)
            if not annexure:
                add("ANNEXURE_NUMBER_REQUIRED", "ERROR", "Every selected document requires an annexure number.", f'documents.{row["key"]}.annexureNumber')
            elif annexure in annexure_numbers:
                add("DUPLICATE_ANNEXURE_NUMBER", "ERROR", "Selected annexures must have unique annexure numbers.", f'documents.{row["key"]}.annexureNumber')
            annexure_numbers.add(annexure)
        if not _selected(payload.get("propertyItems") or []):
            add("NO_PROPERTY_ITEMS", "EXPLANATION", "No seized, recovered or case property is listed; confirm that none applies.", "propertyItems")

    narrative = payload.get("narrative") or {}
    narrative_labels = {
        "caseBackground": "case background",
        "investigationConducted": "investigation conducted",
        "conclusion": "investigation conclusion",
        "prayer": "submission/prayer",
    }
    for field, label in narrative_labels.items():
        if not narrative.get(field):
            add("NARRATIVE_SECTION_REQUIRED", "ERROR", f"Complete the {label} section.", f"narrative.{field}")
    if not payload.get("officerDeclaration"):
        add("OFFICER_DECLARATION_REQUIRED", "ERROR", "The IO must confirm that the report contains only verified case facts.", "officerDeclaration")

    counts = {
        "errors": sum(1 for issue in issues if issue["severity"] == "ERROR"),
        "explanations": sum(1 for issue in issues if issue["severity"] == "EXPLANATION"),
        "unansweredExplanations": sum(
            1 for issue in issues if issue["severity"] == "EXPLANATION" and not issue["explanation"]
        ),
        "advisories": sum(1 for issue in issues if issue["severity"] == "ADVISORY"),
    }
    return {
        "ready": counts["errors"] == 0 and counts["unansweredExplanations"] == 0,
        "counts": counts,
        "issues": issues,
        "checkedAt": _now_iso(),
    }


def _changed_sections(previous: dict[str, Any] | None, current: dict[str, Any]) -> list[str]:
    if previous is None:
        return list(current.keys())
    return [key for key in current if previous.get(key) != current.get(key)]


def _insert_version(
    cur: psycopg.Cursor,
    *,
    report_id: str,
    version_number: int,
    event: str,
    status: str,
    snapshot: dict[str, Any],
    validation: dict[str, Any],
    officer_id: str,
    changed_sections: list[str],
) -> None:
    cur.execute(
        '''
        INSERT INTO "FinalReportVersion"
          (id, "reportId", "versionNumber", event, status, "changedSections",
           snapshot, validation, "createdById", "createdAt")
        VALUES
          (%(id)s, %(reportId)s, %(versionNumber)s, %(event)s, %(status)s,
           %(changedSections)s, %(snapshot)s, %(validation)s, %(createdById)s, NOW())
        ''',
        {
            "id": new_id(),
            "reportId": report_id,
            "versionNumber": version_number,
            "event": event,
            "status": status,
            "changedSections": changed_sections,
            "snapshot": Jsonb(snapshot),
            "validation": Jsonb(validation),
            "createdById": officer_id,
        },
    )


def get_report(
    case_id: str,
    officer: dict[str, Any],
    *,
    upgrade_editable: bool = True,
) -> dict[str, Any]:
    context = _source_context(case_id, officer)
    if not context:
        raise HTTPException(status_code=404, detail="Case not found")
    try:
        report = fetch_one(
            '''
            SELECT fr.*, creator.name AS "createdByName", updater.name AS "updatedByName",
                   reviewer.name AS "reviewedByName", approver.name AS "approvedByName"
            FROM "FinalReport" fr
            JOIN "Officer" creator ON fr."createdById" = creator.id
            JOIN "Officer" updater ON fr."updatedById" = updater.id
            LEFT JOIN "Officer" reviewer ON fr."reviewedById" = reviewer.id
            LEFT JOIN "Officer" approver ON fr."approvedById" = approver.id
            WHERE fr."caseId" = %(caseId)s AND fr."reportType" = %(reportType)s
              AND fr."sequenceNumber" = 1
            ''',
            {"caseId": case_id, "reportType": REPORT_TYPE},
        )
    except psycopg.errors.UndefinedTable:
        return {"storageReady": False, "report": None, "context": context}
    if upgrade_editable and report and report.get("status") in EDITABLE_STATUSES:
        upgraded = upgrade_payload(report.get("payload") or {}, context)
        if upgraded != report.get("payload"):
            report["payload"] = upgraded
            report["validation"] = validate_payload(upgraded)
            report["upgradePending"] = True
    return {"storageReady": True, "report": report, "context": context}


def initialize_report(case_id: str, officer: dict[str, Any]) -> dict[str, Any]:
    if is_police_it(officer.get("role")):
        raise HTTPException(status_code=403, detail="Your role cannot prepare final reports")
    context = _source_context(case_id, officer)
    if not context:
        raise HTTPException(status_code=404, detail="Case not found")
    payload = _initial_payload(context)
    validation = validate_payload(payload)
    report_id = new_id()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                '''
                INSERT INTO "FinalReport"
                  (id, "caseId", "reportType", "sequenceNumber", status, "formatVersion",
                   revision, "versionNumber", payload, validation, "createdById", "updatedById",
                   "createdAt", "updatedAt")
                VALUES
                  (%(id)s, %(caseId)s, %(reportType)s, 1, 'DRAFT', %(formatVersion)s,
                   1, 1, %(payload)s, %(validation)s, %(officerId)s, %(officerId)s, NOW(), NOW())
                ON CONFLICT ("caseId", "reportType", "sequenceNumber") DO NOTHING
                RETURNING *
                ''',
                {
                    "id": report_id,
                    "caseId": case_id,
                    "reportType": REPORT_TYPE,
                    "formatVersion": FORMAT_VERSION,
                    "payload": Jsonb(payload),
                    "validation": Jsonb(validation),
                    "officerId": officer["id"],
                },
            )
            inserted = serialize_row(cur.fetchone())
            if inserted:
                _insert_version(
                    cur,
                    report_id=report_id,
                    version_number=1,
                    event="INITIALIZED",
                    status="DRAFT",
                    snapshot=payload,
                    validation=validation,
                    officer_id=officer["id"],
                    changed_sections=list(payload.keys()),
                )
        conn.commit()
    return get_report(case_id, officer)


def save_report(
    case_id: str,
    officer: dict[str, Any],
    *,
    payload: dict[str, Any],
    expected_revision: int,
) -> dict[str, Any]:
    if is_police_it(officer.get("role")):
        raise HTTPException(status_code=403, detail="Your role cannot prepare final reports")
    context = _source_context(case_id, officer)
    if not context:
        raise HTTPException(status_code=404, detail="Case not found")
    normalized = normalize_payload(deepcopy(payload), context)
    validation = validate_payload(normalized)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT * FROM "FinalReport"
                WHERE "caseId" = %(caseId)s AND "reportType" = %(reportType)s
                  AND "sequenceNumber" = 1
                FOR UPDATE
                ''',
                {"caseId": case_id, "reportType": REPORT_TYPE},
            )
            current = serialize_row(cur.fetchone())
            if not current:
                raise HTTPException(status_code=404, detail="Initialize the final report before saving")
            if current["status"] not in EDITABLE_STATUSES:
                raise HTTPException(status_code=409, detail="This report is locked for review or approval")
            if current["revision"] != expected_revision:
                raise HTTPException(status_code=409, detail="This draft changed in another session; reload before saving")
            next_revision = int(current["revision"]) + 1
            next_version = int(current["versionNumber"]) + 1
            changed = _changed_sections(current.get("payload"), normalized)
            cur.execute(
                '''
                UPDATE "FinalReport"
                SET payload = %(payload)s, validation = %(validation)s,
                    "formatVersion" = %(formatVersion)s,
                    revision = %(revision)s, "versionNumber" = %(versionNumber)s,
                    "updatedById" = %(officerId)s, "updatedAt" = NOW()
                WHERE id = %(reportId)s
                ''',
                {
                    "payload": Jsonb(normalized),
                    "validation": Jsonb(validation),
                    "formatVersion": FORMAT_VERSION,
                    "revision": next_revision,
                    "versionNumber": next_version,
                    "officerId": officer["id"],
                    "reportId": current["id"],
                },
            )
            _insert_version(
                cur,
                report_id=current["id"],
                version_number=next_version,
                event="DRAFT_SAVED",
                status=current["status"],
                snapshot=normalized,
                validation=validation,
                officer_id=officer["id"],
                changed_sections=changed,
            )
        conn.commit()
    return get_report(case_id, officer)


def refresh_report_sources(
    case_id: str,
    officer: dict[str, Any],
    *,
    expected_revision: int,
) -> dict[str, Any]:
    """Fill missing draft fields from current case sources and version the result."""
    if is_police_it(officer.get("role")):
        raise HTTPException(status_code=403, detail="Your role cannot prepare final reports")
    context = _source_context(case_id, officer)
    if not context:
        raise HTTPException(status_code=404, detail="Case not found")
    sources = context.get("reportSources")
    if sources is None:
        raise HTTPException(status_code=503, detail="Report-source storage is not ready; apply migration 0012")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                '''SELECT * FROM "FinalReport"
                   WHERE "caseId" = %(caseId)s AND "reportType" = %(reportType)s
                     AND "sequenceNumber" = 1 FOR UPDATE''',
                {"caseId": case_id, "reportType": REPORT_TYPE},
            )
            current = serialize_row(cur.fetchone())
            if not current:
                raise HTTPException(status_code=404, detail="Initialize the final report before refreshing case data")
            if current["status"] not in EDITABLE_STATUSES:
                raise HTTPException(status_code=409, detail="This report is locked for review or approval")
            if int(current["revision"]) != expected_revision:
                raise HTTPException(status_code=409, detail="This draft changed in another session; reload before refreshing")

            merged = merge_case_sources(current.get("payload") or {}, sources)
            normalized = normalize_payload(merged, context)
            changed = _changed_sections(current.get("payload"), normalized)
            if not changed:
                return get_report(case_id, officer)
            validation = validate_payload(normalized)
            next_revision = int(current["revision"]) + 1
            next_version = int(current["versionNumber"]) + 1
            cur.execute(
                '''UPDATE "FinalReport"
                   SET payload = %(payload)s, validation = %(validation)s,
                       "formatVersion" = %(formatVersion)s, revision = %(revision)s,
                       "versionNumber" = %(versionNumber)s, "updatedById" = %(officerId)s,
                       "updatedAt" = NOW()
                   WHERE id = %(reportId)s''',
                {
                    "payload": Jsonb(normalized),
                    "validation": Jsonb(validation),
                    "formatVersion": FORMAT_VERSION,
                    "revision": next_revision,
                    "versionNumber": next_version,
                    "officerId": officer["id"],
                    "reportId": current["id"],
                },
            )
            _insert_version(
                cur,
                report_id=current["id"],
                version_number=next_version,
                event="SOURCES_REFRESHED",
                status=current["status"],
                snapshot=normalized,
                validation=validation,
                officer_id=officer["id"],
                changed_sections=changed,
            )
        conn.commit()
    return get_report(case_id, officer)


def _workflow_transition(
    case_id: str,
    officer: dict[str, Any],
    *,
    expected_status: str,
    next_status: str,
    event: str,
    review_note: str | None = None,
) -> dict[str, Any]:
    scoped = get_report(case_id, officer)
    if not scoped.get("report"):
        raise HTTPException(status_code=404, detail="Final report not found")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT fr.* FROM "FinalReport" fr
                JOIN "Case" c ON fr."caseId" = c.id
                WHERE fr."caseId" = %(caseId)s AND fr."reportType" = %(reportType)s
                  AND fr."sequenceNumber" = 1
                FOR UPDATE
                ''',
                {"caseId": case_id, "reportType": REPORT_TYPE},
            )
            report = serialize_row(cur.fetchone())
            if not report:
                raise HTTPException(status_code=404, detail="Final report not found")
            if report["status"] != expected_status:
                raise HTTPException(status_code=409, detail=f'Expected report status {expected_status}, found {report["status"]}')
            if _clean_int((report.get("payload") or {}).get("schemaVersion"), minimum=1) < SCHEMA_VERSION:
                raise HTTPException(status_code=409, detail="Save the upgraded structured draft before submitting it for review")
            validation = validate_payload(report["payload"])
            if next_status in {"READY_FOR_REVIEW", "APPROVED"} and not validation["ready"]:
                raise HTTPException(status_code=422, detail={"message": "Resolve blocking report errors first", "validation": validation})
            if next_status == "APPROVED":
                if officer.get("role") not in REVIEWER_ROLES:
                    raise HTTPException(status_code=403, detail="Your role cannot approve final reports")
                if officer["id"] == report["createdById"]:
                    raise HTTPException(status_code=403, detail="A report must be approved by an officer other than its creator")

            next_version = int(report["versionNumber"]) + 1
            reviewed_by = officer["id"] if next_status in {"RETURNED", "APPROVED"} else report.get("reviewedById")
            approved_by = officer["id"] if next_status == "APPROVED" else report.get("approvedById")
            cur.execute(
                '''
                UPDATE "FinalReport"
                SET status = %(status)s, validation = %(validation)s,
                    "versionNumber" = %(versionNumber)s, "updatedById" = %(officerId)s,
                    "reviewedById" = %(reviewedById)s, "approvedById" = %(approvedById)s,
                    "reviewNote" = %(reviewNote)s,
                    "submittedAt" = CASE WHEN %(status)s = 'READY_FOR_REVIEW' THEN NOW() ELSE "submittedAt" END,
                    "approvedAt" = CASE WHEN %(status)s = 'APPROVED' THEN NOW() ELSE NULL END,
                    "lockedAt" = CASE WHEN %(status)s = 'APPROVED' THEN NOW() WHEN %(status)s = 'RETURNED' THEN NULL ELSE "lockedAt" END,
                    "updatedAt" = NOW()
                WHERE id = %(reportId)s
                ''',
                {
                    "status": next_status,
                    "validation": Jsonb(validation),
                    "versionNumber": next_version,
                    "officerId": officer["id"],
                    "reviewedById": reviewed_by,
                    "approvedById": approved_by,
                    "reviewNote": _clean_text(review_note, limit=4_000) or None,
                    "reportId": report["id"],
                },
            )
            _insert_version(
                cur,
                report_id=report["id"],
                version_number=next_version,
                event=event,
                status=next_status,
                snapshot=report["payload"],
                validation=validation,
                officer_id=officer["id"],
                changed_sections=["workflowStatus"],
            )
        conn.commit()
    return get_report(case_id, officer)


def submit_for_review(case_id: str, officer: dict[str, Any]) -> dict[str, Any]:
    if is_police_it(officer.get("role")):
        raise HTTPException(status_code=403, detail="Your role cannot submit final reports")
    current = get_report(case_id, officer).get("report")
    if not current:
        raise HTTPException(status_code=404, detail="Final report not found")
    if current["status"] not in EDITABLE_STATUSES:
        raise HTTPException(status_code=409, detail="This report is not editable")
    return _workflow_transition(
        case_id,
        officer,
        expected_status=current["status"],
        next_status="READY_FOR_REVIEW",
        event="SUBMITTED_FOR_REVIEW",
    )


def return_for_correction(case_id: str, officer: dict[str, Any], note: str) -> dict[str, Any]:
    if officer.get("role") not in REVIEWER_ROLES:
        raise HTTPException(status_code=403, detail="Your role cannot review final reports")
    if not _clean_text(note):
        raise HTTPException(status_code=422, detail="A correction note is required")
    return _workflow_transition(
        case_id,
        officer,
        expected_status="READY_FOR_REVIEW",
        next_status="RETURNED",
        event="RETURNED_FOR_CORRECTION",
        review_note=note,
    )


def approve_report(case_id: str, officer: dict[str, Any]) -> dict[str, Any]:
    return _workflow_transition(
        case_id,
        officer,
        expected_status="READY_FOR_REVIEW",
        next_status="APPROVED",
        event="APPROVED",
    )


def list_versions(case_id: str, officer: dict[str, Any]) -> list[dict[str, Any]]:
    report_result = get_report(case_id, officer)
    report = report_result.get("report")
    if not report:
        return []
    return fetch_all(
        '''
        SELECT v.id, v."versionNumber", v.event, v.status, v."changedSections", v."createdAt",
               o.name AS "createdByName", o."badgeId" AS "createdByBadgeId"
        FROM "FinalReportVersion" v
        JOIN "Officer" o ON v."createdById" = o.id
        WHERE v."reportId" = %(reportId)s
        ORDER BY v."versionNumber" DESC
        ''',
        {"reportId": report["id"]},
    )


def render_legacy_markdown(payload: dict[str, Any]) -> str:
    """Non-AI compatibility view for old bookmarks and integrations."""
    case = payload.get("caseDetails") or {}
    narrative = payload.get("narrative") or {}
    accused = _selected(payload.get("accused") or [])
    offences = _selected(payload.get("offences") or [])
    witnesses = _selected(payload.get("witnesses") or [])
    evidence = _selected(payload.get("evidence") or [])
    lines = [
        "# PROVISIONAL FINAL REPORT / CHARGE-SHEET DRAFT",
        "",
        f'**BNSS section 193 | Format {FORMAT_VERSION} | Officer review required**',
        "",
        "## Case details",
        f'- FIR: {case.get("firNumber", "")}',
        f'- Police station: {case.get("stationName", "")}',
        f'- Crime type: {case.get("crimeType", "")}',
        "",
        "## Accused sent for trial",
    ]
    lines.extend(f'- {row["name"]}: {row.get("allegation") or "Allegation not recorded"}' for row in accused)
    lines.extend(["", "## Alleged offences"])
    lines.extend(f'- {row["actCode"]} {row["sectionNumber"]}: {row["title"]}' for row in offences)
    lines.extend(["", "## Witnesses"])
    lines.extend(f'- {row["name"]}' for row in witnesses)
    lines.extend(["", "## Evidence registry"])
    lines.extend(f'- {row["type"]}: {row["description"]}' for row in evidence)
    for title, key in (
        ("Case background", "caseBackground"),
        ("Investigation conducted", "investigationConducted"),
        ("Conclusion", "conclusion"),
        ("Prayer", "prayer"),
    ):
        lines.extend(["", f"## {title}", narrative.get(key) or "Not completed."])
    return "\n".join(lines)
