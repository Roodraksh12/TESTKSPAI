from __future__ import annotations

from typing import Any

from app.services import intake_intel
from app.services.db import execute, fetch_all, fetch_one, new_id


def station_filter_sql(is_sp: bool, station_id: str, alias: str = "c") -> tuple[str, dict[str, Any]]:
    if is_sp:
        return "", {}
    return f' AND {alias}."stationId" = %(stationId)s', {"stationId": station_id}


def person_in_scope_sql(is_sp: bool, station_id: str, person_alias: str = "p") -> tuple[str, dict[str, Any]]:
    """Scope a Person query to persons linked (via CasePerson) to a case at the officer's station.

    Person has no stationId of its own, so scoping goes through an EXISTS check
    against CasePerson/Case rather than a direct column filter.
    """
    if is_sp:
        return "", {}
    return (
        f'''
        AND EXISTS (
            SELECT 1 FROM "CasePerson" cp
            JOIN "Case" c ON cp."caseId" = c.id
            WHERE cp."personId" = {person_alias}.id AND c."stationId" = %(scopeStationId)s
        )
        ''',
        {"scopeStationId": station_id},
    )


def create_audit_log(
    officer_id: str,
    action: str,
    target_type: str,
    target_id: str | None = None,
    details: str | None = None,
) -> None:
    execute(
        '''
        INSERT INTO "AuditLog" (id, "officerId", action, "targetType", "targetId", details, "createdAt")
        VALUES (%(id)s, %(officerId)s, %(action)s, %(targetType)s, %(targetId)s, %(details)s, NOW())
        ''',
        {
            "id": new_id(),
            "officerId": officer_id,
            "action": action,
            "targetType": target_type,
            "targetId": target_id,
            "details": details,
        },
    )


def load_officer_by_id(officer_id: str) -> dict[str, Any] | None:
    return fetch_one(
        '''
        SELECT o.id, o."badgeId", o.name, o.role, o."stationId",
               ps."districtId", ps.name AS "stationName",
               d.name AS "districtName"
        FROM "Officer" o
        JOIN "PoliceStation" ps ON o."stationId" = ps.id
        JOIN "District" d ON ps."districtId" = d.id
        WHERE o.id = %(id)s
        ''',
        {"id": officer_id},
    )


def load_officer_by_badge(badge_id: str) -> dict[str, Any] | None:
    return fetch_one(
        '''
        SELECT o.id, o."badgeId", o."passwordHash", o.name, o.role, o."stationId",
               ps."districtId", ps.name AS "stationName",
               d.name AS "districtName"
        FROM "Officer" o
        JOIN "PoliceStation" ps ON o."stationId" = ps.id
        JOIN "District" d ON ps."districtId" = d.id
        WHERE o."badgeId" = %(badgeId)s
        ''',
        {"badgeId": badge_id},
    )


def officer_user_payload(officer: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": officer["id"],
        "badgeId": officer["badgeId"],
        "name": officer["name"],
        "role": officer["role"],
        "stationId": officer["stationId"],
        "districtId": officer["districtId"],
        # Human-readable names travel with the payload so the UI can show
        # "Whitefield PS" rather than a cuid the officer can't interpret.
        "stationName": officer.get("stationName"),
        "districtName": officer.get("districtName"),
    }


def get_case_with_relations(case_id: str, officer: dict[str, Any]) -> dict[str, Any] | None:
    is_sp = officer.get("role") == "SP"
    scope_sql, scope_params = station_filter_sql(is_sp, officer["stationId"])
    case_row = fetch_one(
        f'''
        SELECT c.*, ps.name AS "stationName"
        FROM "Case" c
        LEFT JOIN "PoliceStation" ps ON c."stationId" = ps.id
        WHERE c.id = %(caseId)s{scope_sql}
        ''',
        {"caseId": case_id, **scope_params},
    )
    if not case_row:
        return None

    case_persons = fetch_all(
        '''
        SELECT cp.id, cp."caseId", cp."personId", cp.role,
               p.id AS "person_id", p.name, p.role AS "personRole", p.phone, p.address
        FROM "CasePerson" cp
        JOIN "Person" p ON cp."personId" = p.id
        WHERE cp."caseId" = %(caseId)s
        ''',
        {"caseId": case_id},
    )
    matches = fetch_all(
        '''
        SELECT cm.*,
               p.name AS "matchedPersonName",
               mc."firNumber" AS "matchedFirNumber"
        FROM "CaseMatch" cm
        LEFT JOIN "Person" p ON cm."matchedPersonId" = p.id
        LEFT JOIN "Case" mc ON cm."matchedCaseId" = mc.id
        WHERE cm."caseId" = %(caseId)s
        ORDER BY cm."confidenceScore" DESC
        ''',
        {"caseId": case_id},
    )

    case_row["casePersons"] = [
        {
            "id": cp["id"],
            "caseId": cp["caseId"],
            "personId": cp["personId"],
            "role": cp["role"],
            "person": {
                "id": cp["person_id"],
                "name": cp["name"],
                "role": cp["personRole"],
                "phone": cp.get("phone"),
                "address": cp.get("address"),
            },
        }
        for cp in case_persons
    ]
    case_row["matches"] = matches
    case_row["station"] = {"name": case_row.pop("stationName", None)}
    return case_row
