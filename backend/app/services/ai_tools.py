from __future__ import annotations

import json
import re
from typing import Any

from app.services import deadline_engine, intake_intel
from app.services.case_access import (
    create_audit_log,
    get_case_with_relations,
    person_in_scope_sql,
    station_filter_sql,
)
from app.services.db import fetch_all, fetch_one


async def search_cases(args: dict[str, Any], station_id: str, is_sp: bool = False) -> list[dict[str, Any]]:
    clauses = []
    params: dict[str, Any] = {}
    if not is_sp:
        clauses.append('"stationId" = %(stationId)s')
        params["stationId"] = station_id
    if args.get("crimeType"):
        clauses.append('"crimeType" ILIKE %(crimeType)s')
        params["crimeType"] = f'%{args["crimeType"]}%'
    if args.get("status"):
        clauses.append("status = %(status)s")
        params["status"] = args["status"]
    where = " AND ".join(clauses) if clauses else "1=1"
    return fetch_all(
        f'''
        SELECT id, "firNumber", "crimeType", summary, status, "incidentDate"
        FROM "Case"
        WHERE {where}
        ORDER BY "reportedDate" DESC
        LIMIT 5
        ''',
        params,
    )


async def get_case_dossier(args: dict[str, Any], station_id: str, is_sp: bool = False) -> dict[str, Any]:
    officer = {"role": "SP" if is_sp else "INSPECTOR", "stationId": station_id}
    case_data = get_case_with_relations(args["caseId"], officer)
    return case_data or {"error": "Case not found or access denied."}


async def get_person_connections(
    args: dict[str, Any], station_id: str, is_sp: bool = False
) -> list[dict[str, Any]]:
    scope_sql, scope_params = person_in_scope_sql(is_sp, station_id, person_alias="p")
    in_scope = fetch_one(
        f'SELECT id FROM "Person" p WHERE p.id = %(personId)s{scope_sql}',
        {"personId": args["personId"], **scope_params},
    )
    if not in_scope:
        return []
    return fetch_all(
        '''
        SELECT c.*,
               pa.name AS "personAName", pb.name AS "personBName",
               sc."firNumber" AS "sourceFirNumber"
        FROM "Connection" c
        JOIN "Person" pa ON c."personAId" = pa.id
        JOIN "Person" pb ON c."personBId" = pb.id
        LEFT JOIN "Case" sc ON c."sourceCaseId" = sc.id
        WHERE c."personAId" = %(personId)s OR c."personBId" = %(personId)s
        ''',
        {"personId": args["personId"]},
    )


async def get_similar_cases(args: dict[str, Any], station_id: str) -> list[dict[str, Any]]:
    return intake_intel.find_mo_similar_cases(case_id=args["caseId"], station_id=station_id, take=5)


async def get_hotspot_summary(
    args: dict[str, Any], station_id: str, is_sp: bool = False
) -> list[dict[str, Any]]:
    _ = args.get("timeframe")
    if is_sp:
        return fetch_all('SELECT * FROM "Alert" ORDER BY "riskScore" DESC LIMIT 5')
    return fetch_all(
        '''
        SELECT * FROM "Alert"
        WHERE "stationId" = %(stationId)s
        ORDER BY "riskScore" DESC
        LIMIT 5
        ''',
        {"stationId": station_id},
    )


async def get_deadline_risks_tool(
    args: dict[str, Any], station_id: str, is_sp: bool = False
) -> list[dict[str, Any]]:
    take = args.get("take") or 10
    return deadline_engine.get_deadline_risks(is_sp, station_id, take=take)


async def fetch_ipc_section(args: dict[str, Any], _station_id: str) -> dict[str, Any]:
    db = {
        "379": "IPC Section 379: Punishment for theft. Whoever commits theft shall be punished with imprisonment of either description for a term which may extend to three years, or with fine, or with both.",
        "392": "IPC Section 392: Punishment for robbery.",
        "302": "IPC Section 302: Punishment for murder. Whoever commits murder shall be punished with death, or imprisonment for life, and shall also be liable to fine.",
        "420": "IPC Section 420: Cheating and dishonestly inducing delivery of property.",
        "BNS 303": "BNS Section 303 (New IPC 379): Theft. Prescribes punishment for theft similar to the old IPC 379.",
        "BNS 309": "BNS Section 309: Robbery (corresponds broadly to IPC 392).",
    }
    query = args["sectionQuery"].upper()
    match = next((k for k in db if k.upper() in query), None)
    if match:
        return {"section": match, "text": db[match]}
    return {
        "error": f"Could not find legal section matching query: {args['sectionQuery']}. Try specific numbers like '379' or '392'."
    }


async def extract_entities(args: dict[str, Any], _station_id: str) -> dict[str, Any]:
    text = args.get("text") or ""
    phones = re.findall(r"\b[6-9]\d{9}\b", text)
    vehicles = re.findall(r"\bKA[-\s]?\d{2}[-\s]?[A-Z]{1,2}[-\s]?\d{1,4}\b", text, re.IGNORECASE)
    return {
        "success": True,
        "entities": {
            "phones": phones,
            "vehicles": vehicles,
            "note": "Heuristic extraction only — verify against FIR text.",
        },
        "message": "Entities extracted heuristically from provided text.",
    }


async def run_case_intake(args: dict[str, Any], station_id: str, is_sp: bool = False) -> dict[str, Any]:
    return intake_intel.build_case_intake_brief(args["caseId"], station_id, is_sp=is_sp)


async def find_identity_matches_tool(
    args: dict[str, Any], station_id: str, is_sp: bool = False
) -> Any:
    if args.get("caseId"):
        scope_sql, scope_params = station_filter_sql(is_sp, station_id)
        case_row = fetch_one(
            f'SELECT * FROM "Case" WHERE id = %(caseId)s{scope_sql}',
            {"caseId": args["caseId"], **scope_params},
        )
        if not case_row:
            return {"error": "Case not found or access denied"}
        persons = fetch_all(
            '''
            SELECT p.name, p.phone, p.address
            FROM "CasePerson" cp
            JOIN "Person" p ON cp."personId" = p.id
            WHERE cp."caseId" = %(caseId)s
            ''',
            {"caseId": args["caseId"]},
        )
        names = args.get("names") or [p["name"] for p in persons]
        return intake_intel.find_identity_matches(
            names=names,
            phones=[p["phone"] for p in persons if p.get("phone")],
            addresses=[p["address"] for p in persons if p.get("address")],
            exclude_case_id=case_row["id"],
            station_id=case_row["stationId"],
        )
    if not args.get("names"):
        return {"error": "Provide caseId or names[]"}
    return intake_intel.find_identity_matches(names=args["names"], station_id=station_id)


async def find_mo_similar_cases_tool(
    args: dict[str, Any], station_id: str, is_sp: bool = False
) -> Any:
    scope_sql, scope_params = station_filter_sql(is_sp, station_id)
    case_row = fetch_one(
        f'SELECT * FROM "Case" WHERE id = %(caseId)s{scope_sql}',
        {"caseId": args["caseId"], **scope_params},
    )
    if not case_row:
        return {"error": "Case not found or access denied"}
    return intake_intel.find_mo_similar_cases(case_id=case_row["id"], station_id=case_row["stationId"], take=5)


async def get_investigation_checklist_tool(
    args: dict[str, Any], station_id: str, is_sp: bool = False
) -> dict[str, Any]:
    if args.get("caseId"):
        scope_sql, scope_params = station_filter_sql(is_sp, station_id)
        case_row = fetch_one(
            f'''
            SELECT c.*, ps.name AS "stationName"
            FROM "Case" c
            LEFT JOIN "PoliceStation" ps ON c."stationId" = ps.id
            WHERE c.id = %(caseId)s{scope_sql}
            ''',
            {"caseId": args["caseId"], **scope_params},
        )
        if not case_row:
            return {"error": "Case not found or access denied"}
        return {
            "caseId": case_row["id"],
            "firNumber": case_row["firNumber"],
            "checklist": intake_intel.get_investigation_checklist(
                case_row["crimeType"], case_row.get("stationName")
            ),
        }
    if not args.get("crimeType"):
        return {"error": "Provide caseId or crimeType"}
    return {"checklist": intake_intel.get_investigation_checklist(args["crimeType"])}


async def draft_case_summary_tool(
    args: dict[str, Any], station_id: str, is_sp: bool = False
) -> dict[str, Any]:
    return intake_intel.draft_case_summary(
        args["caseId"],
        station_id,
        is_sp=is_sp,
        audience=args.get("audience") or "SP",
    )


async def suggest_legal_sections_tool(
    args: dict[str, Any], station_id: str, is_sp: bool = False
) -> dict[str, Any]:
    if args.get("caseId"):
        scope_sql, scope_params = station_filter_sql(is_sp, station_id)
        case_row = fetch_one(
            f'SELECT * FROM "Case" WHERE id = %(caseId)s{scope_sql}',
            {"caseId": args["caseId"], **scope_params},
        )
        if not case_row:
            return {"error": "Case not found or access denied"}
        legal = intake_intel.suggest_legal_sections(case_row["crimeType"], case_row.get("summary"))
        return {
            "caseId": case_row["id"],
            "firNumber": case_row["firNumber"],
            **legal,
            "mo": intake_intel.extract_mo_from_text(case_row.get("summary")),
        }
    if not args.get("crimeType"):
        return {"error": "Provide caseId or crimeType"}
    return intake_intel.suggest_legal_sections(args["crimeType"])


async def update_match_status_tool(
    args: dict[str, Any], station_id: str, officer_id: str, is_sp: bool = False
) -> dict[str, Any]:
    if args.get("status") not in ("CONFIRMED", "REJECTED"):
        return {"error": "status must be CONFIRMED or REJECTED"}
    return intake_intel.update_match_status(
        args["matchId"], args["status"], officer_id, station_id, is_sp=is_sp
    )


TOOL_HANDLERS = {
    "search_cases": lambda args, station_id, officer_id, is_sp: search_cases(args, station_id, is_sp),
    "get_case_dossier": lambda args, station_id, officer_id, is_sp: get_case_dossier(args, station_id, is_sp),
    "run_case_intake": lambda args, station_id, officer_id, is_sp: run_case_intake(args, station_id, is_sp),
    "find_identity_matches": lambda args, station_id, officer_id, is_sp: find_identity_matches_tool(args, station_id, is_sp),
    "find_mo_similar_cases": lambda args, station_id, officer_id, is_sp: find_mo_similar_cases_tool(args, station_id, is_sp),
    "get_investigation_checklist": lambda args, station_id, officer_id, is_sp: get_investigation_checklist_tool(args, station_id, is_sp),
    "draft_case_summary": lambda args, station_id, officer_id, is_sp: draft_case_summary_tool(args, station_id, is_sp),
    "suggest_legal_sections": lambda args, station_id, officer_id, is_sp: suggest_legal_sections_tool(args, station_id, is_sp),
    "update_match_status": lambda args, station_id, officer_id, is_sp: update_match_status_tool(args, station_id, officer_id, is_sp),
    "get_person_connections": lambda args, station_id, officer_id, is_sp: get_person_connections(args, station_id, is_sp),
    "get_similar_cases": lambda args, station_id, officer_id, is_sp: get_similar_cases(args, station_id),
    "get_hotspot_summary": lambda args, station_id, officer_id, is_sp: get_hotspot_summary(args, station_id, is_sp),
    "fetch_ipc_section": lambda args, station_id, officer_id, is_sp: fetch_ipc_section(args, station_id),
    "extract_entities": lambda args, station_id, officer_id, is_sp: extract_entities(args, station_id),
    "get_deadline_risks": lambda args, station_id, officer_id, is_sp: get_deadline_risks_tool(args, station_id, is_sp),
}


AVAILABLE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_cases",
            "description": "Search cases by crime type or status at the officer's station.",
            "parameters": {
                "type": "object",
                "properties": {"crimeType": {"type": "string"}, "status": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_case_dossier",
            "description": "Get full details of a specific case including persons and matches.",
            "parameters": {
                "type": "object",
                "properties": {"caseId": {"type": "string"}},
                "required": ["caseId"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_case_intake",
            "description": "Run full post-upload intake for a case.",
            "parameters": {
                "type": "object",
                "properties": {"caseId": {"type": "string"}},
                "required": ["caseId"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_identity_matches",
            "description": "Find prior persons/cases matching names/phones on a case (leads only).",
            "parameters": {
                "type": "object",
                "properties": {
                    "caseId": {"type": "string"},
                    "names": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_mo_similar_cases",
            "description": "Find cases with similar modus operandi / narrative at the station.",
            "parameters": {
                "type": "object",
                "properties": {"caseId": {"type": "string"}},
                "required": ["caseId"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_investigation_checklist",
            "description": "Get ordered 0–72h investigation checklist for a case or crime type.",
            "parameters": {
                "type": "object",
                "properties": {"caseId": {"type": "string"}, "crimeType": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "draft_case_summary",
            "description": "Draft a grounded SP/SHO/IO progress note from case record only (not filed).",
            "parameters": {
                "type": "object",
                "properties": {
                    "caseId": {"type": "string"},
                    "audience": {"type": "string", "enum": ["SP", "SHO", "IO"]},
                },
                "required": ["caseId"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_legal_sections",
            "description": "Suggest IPC/BNS framing and evidence still needed for a case.",
            "parameters": {
                "type": "object",
                "properties": {"caseId": {"type": "string"}, "crimeType": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_match_status",
            "description": "Confirm or reject a pending identity/MO match (officer decision).",
            "parameters": {
                "type": "object",
                "properties": {
                    "matchId": {"type": "string"},
                    "status": {"type": "string", "enum": ["CONFIRMED", "REJECTED"]},
                },
                "required": ["matchId", "status"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_person_connections",
            "description": "Get network connections for a person.",
            "parameters": {
                "type": "object",
                "properties": {"personId": {"type": "string"}},
                "required": ["personId"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_similar_cases",
            "description": "Alias for MO-similar cases for a given case id.",
            "parameters": {
                "type": "object",
                "properties": {"caseId": {"type": "string"}},
                "required": ["caseId"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_hotspot_summary",
            "description": "Get hotspot and anomaly alerts for the station.",
            "parameters": {
                "type": "object",
                "properties": {"timeframe": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_ipc_section",
            "description": "Look up a specific IPC or BNS section text.",
            "parameters": {
                "type": "object",
                "properties": {"sectionQuery": {"type": "string"}},
                "required": ["sectionQuery"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "extract_entities",
            "description": "Heuristic extract phones/vehicles from text.",
            "parameters": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_deadline_risks",
            "description": (
                "Get cases at risk of missing the statutory charge-sheet deadline "
                "(BNSS 187(3) default-bail risk) — overdue or urgent tiers only."
            ),
            "parameters": {
                "type": "object",
                "properties": {"take": {"type": "integer"}},
            },
        },
    },
]


NEEDS_CASE_TOOLS = {
    "get_case_dossier",
    "run_case_intake",
    "find_identity_matches",
    "find_mo_similar_cases",
    "get_investigation_checklist",
    "draft_case_summary",
    "suggest_legal_sections",
    "get_similar_cases",
}


async def execute_tool(
    name: str,
    args: dict[str, Any],
    station_id: str,
    officer_id: str,
    is_sp: bool,
) -> Any:
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        return {"error": f"Unknown tool: {name}"}
    return await handler(args, station_id, officer_id, is_sp)


def filter_tools_for_role(role: str) -> list[dict[str, Any]]:
    if role == "CONSTABLE":
        restricted = {"get_hotspot_summary", "get_person_connections"}
        return [tool for tool in AVAILABLE_TOOLS if tool["function"]["name"] not in restricted]
    return AVAILABLE_TOOLS


def serialize_tool_result(tool_result: Any) -> str:
    if isinstance(tool_result, dict) and "markdown" in tool_result:
        return json.dumps(tool_result)
    return json.dumps(tool_result, default=str)
