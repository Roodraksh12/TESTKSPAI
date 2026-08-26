from __future__ import annotations

import json
import re
from typing import Any

from app.services import crime_queries, deadline_engine, intake_intel
from app.services.case_access import (
    create_audit_log,
    get_case_with_relations,
    jurisdiction_filter_sql,
    person_in_scope_sql_for_officer,
)
from app.services.db import fetch_all, fetch_one


async def search_cases(args: dict[str, Any], officer: dict[str, Any]) -> Any:
    return crime_queries.search_cases(args, officer)


async def get_crime_statistics_tool(
    args: dict[str, Any], officer: dict[str, Any]
) -> dict[str, Any]:
    return crime_queries.get_crime_statistics(args, officer)


async def get_case_dossier(args: dict[str, Any], officer: dict[str, Any]) -> dict[str, Any]:
    case_data = get_case_with_relations(args["caseId"], officer)
    return case_data or {"error": "Case not found or access denied."}


async def get_person_connections(
    args: dict[str, Any], officer: dict[str, Any]
) -> list[dict[str, Any]]:
    scope_sql, scope_params = person_in_scope_sql_for_officer(officer, person_alias="p")
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


async def get_similar_cases(args: dict[str, Any], officer: dict[str, Any]) -> list[dict[str, Any]]:
    case_data = get_case_with_relations(args["caseId"], officer)
    if not case_data:
        return []
    return intake_intel.find_mo_similar_cases(
        case_id=case_data["id"],
        station_id=case_data["stationId"],
        take=5,
    )


async def get_hotspot_summary(
    args: dict[str, Any], officer: dict[str, Any]
) -> list[dict[str, Any]]:
    _ = args.get("timeframe")
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="a")
    return fetch_all(
        f'''
        SELECT * FROM "Alert" a
        WHERE 1=1{scope_sql}
        ORDER BY a."riskScore" DESC
        LIMIT 5
        ''',
        scope_params,
    )


async def get_deadline_risks_tool(
    args: dict[str, Any], officer: dict[str, Any]
) -> list[dict[str, Any]]:
    take = args.get("take") or 10
    return deadline_engine.get_deadline_risks(officer, take=take)


async def fetch_ipc_section(args: dict[str, Any], _officer: dict[str, Any]) -> dict[str, Any]:
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


async def extract_entities(args: dict[str, Any], _officer: dict[str, Any]) -> dict[str, Any]:
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


async def run_case_intake(args: dict[str, Any], officer: dict[str, Any]) -> dict[str, Any]:
    return intake_intel.build_case_intake_brief(args["caseId"], officer)


async def find_identity_matches_tool(
    args: dict[str, Any], officer: dict[str, Any]
) -> Any:
    if args.get("caseId"):
        case_row = get_case_with_relations(args["caseId"], officer)
        if not case_row:
            return {"error": "Case not found or access denied"}
        persons = [
            {
                "name": cp["person"]["name"],
                "phone": cp["person"].get("phone"),
                "address": cp["person"].get("address"),
            }
            for cp in case_row.get("casePersons") or []
        ]
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
    return intake_intel.find_identity_matches(
        names=args["names"],
        station_id=officer.get("stationId"),
    )


async def find_mo_similar_cases_tool(
    args: dict[str, Any], officer: dict[str, Any]
) -> Any:
    case_row = get_case_with_relations(args["caseId"], officer)
    if not case_row:
        return {"error": "Case not found or access denied"}
    return intake_intel.find_mo_similar_cases(case_id=case_row["id"], station_id=case_row["stationId"], take=5)


async def get_investigation_checklist_tool(
    args: dict[str, Any], officer: dict[str, Any]
) -> dict[str, Any]:
    if args.get("caseId"):
        case_row = get_case_with_relations(args["caseId"], officer)
        if not case_row:
            return {"error": "Case not found or access denied"}
        station_name = (case_row.get("station") or {}).get("name")
        return {
            "caseId": case_row["id"],
            "firNumber": case_row["firNumber"],
            "checklist": intake_intel.get_investigation_checklist(
                case_row["crimeType"], station_name
            ),
        }
    if not args.get("crimeType"):
        return {"error": "Provide caseId or crimeType"}
    return {"checklist": intake_intel.get_investigation_checklist(args["crimeType"])}


async def draft_case_summary_tool(
    args: dict[str, Any], officer: dict[str, Any]
) -> dict[str, Any]:
    return intake_intel.draft_case_summary(
        args["caseId"],
        officer,
        audience=args.get("audience") or "SP",
    )


async def suggest_legal_sections_tool(
    args: dict[str, Any], officer: dict[str, Any]
) -> dict[str, Any]:
    if args.get("caseId"):
        case_row = get_case_with_relations(args["caseId"], officer)
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


TOOL_HANDLERS = {
    "search_cases": lambda args, officer: search_cases(args, officer),
    "get_crime_statistics": lambda args, officer: get_crime_statistics_tool(args, officer),
    "get_case_dossier": lambda args, officer: get_case_dossier(args, officer),
    "run_case_intake": lambda args, officer: run_case_intake(args, officer),
    "find_identity_matches": lambda args, officer: find_identity_matches_tool(args, officer),
    "find_mo_similar_cases": lambda args, officer: find_mo_similar_cases_tool(args, officer),
    "get_investigation_checklist": lambda args, officer: get_investigation_checklist_tool(args, officer),
    "draft_case_summary": lambda args, officer: draft_case_summary_tool(args, officer),
    "suggest_legal_sections": lambda args, officer: suggest_legal_sections_tool(args, officer),
    "get_person_connections": lambda args, officer: get_person_connections(args, officer),
    "get_similar_cases": lambda args, officer: get_similar_cases(args, officer),
    "get_hotspot_summary": lambda args, officer: get_hotspot_summary(args, officer),
    "fetch_ipc_section": lambda args, officer: fetch_ipc_section(args, officer),
    "extract_entities": lambda args, officer: extract_entities(args, officer),
    "get_deadline_risks": lambda args, officer: get_deadline_risks_tool(args, officer),
}


AVAILABLE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_cases",
            "description": (
                "Find and list cases inside the officer's permitted jurisdiction. "
                "Supports FIR, crime, status, station/district, person/role and incident-date filters. "
                "Use get_crime_statistics instead when the officer asks for counts or breakdowns."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "General FIR, crime, summary, station, district, person-name or phone search.",
                    },
                    "firNumber": {"type": "string"},
                    "crimeType": {"type": "string"},
                    "status": {
                        "type": "string",
                        "enum": ["OPEN", "UNDER_INVESTIGATION", "CHARGESHEETED", "CLOSED"],
                    },
                    "stationName": {"type": "string"},
                    "districtName": {"type": "string"},
                    "personName": {"type": "string"},
                    "personRole": {
                        "type": "string",
                        "enum": ["ACCUSED", "VICTIM", "WITNESS"],
                    },
                    "timeframe": {
                        "type": "string",
                        "enum": ["all_time", "last_7_days", "last_30_days", "this_month", "this_year"],
                    },
                    "dateFrom": {
                        "type": "string",
                        "description": "Inclusive incident date in YYYY-MM-DD format.",
                    },
                    "dateTo": {
                        "type": "string",
                        "description": "Inclusive incident date in YYYY-MM-DD format.",
                    },
                    "take": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 25,
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_crime_statistics",
            "description": (
                "Count and break down verified case records inside the officer's permitted jurisdiction. "
                "Use for crime patterns, trends, busiest stations/districts, status totals and incident timing."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "crimeType": {"type": "string"},
                    "status": {
                        "type": "string",
                        "enum": ["OPEN", "UNDER_INVESTIGATION", "CHARGESHEETED", "CLOSED"],
                    },
                    "stationName": {"type": "string"},
                    "districtName": {"type": "string"},
                    "personName": {"type": "string"},
                    "personRole": {
                        "type": "string",
                        "enum": ["ACCUSED", "VICTIM", "WITNESS"],
                    },
                    "timeframe": {
                        "type": "string",
                        "enum": ["all_time", "last_7_days", "last_30_days", "this_month", "this_year"],
                    },
                    "dateFrom": {
                        "type": "string",
                        "description": "Inclusive incident date in YYYY-MM-DD format.",
                    },
                    "dateTo": {
                        "type": "string",
                        "description": "Inclusive incident date in YYYY-MM-DD format.",
                    },
                    "groupBy": {
                        "type": "string",
                        "enum": [
                            "crime_type",
                            "status",
                            "station",
                            "district",
                            "month",
                            "day_of_week",
                            "hour_of_day",
                        ],
                    },
                },
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
    officer: dict[str, Any],
) -> Any:
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        return {"error": f"Unknown tool: {name}"}
    return await handler(args, officer)


def filter_tools_for_role(role: str) -> list[dict[str, Any]]:
    if role == "CONSTABLE":
        restricted = {"get_hotspot_summary", "get_person_connections"}
        return [tool for tool in AVAILABLE_TOOLS if tool["function"]["name"] not in restricted]
    return AVAILABLE_TOOLS


def serialize_tool_result(tool_result: Any) -> str:
    if isinstance(tool_result, dict) and "markdown" in tool_result:
        return json.dumps(tool_result)
    return json.dumps(tool_result, default=str)
