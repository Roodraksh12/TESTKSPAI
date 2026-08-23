from __future__ import annotations

from typing import Any

from app.services.db import execute, fetch_all, fetch_one, new_id
from app.services.hierarchy import (
    is_police_it,
    platform_capabilities,
    scope_level_for,
)


def _jurisdiction_scope_sql(
    officer: dict[str, Any],
    alias: str,
    id_column: str,
) -> tuple[str, dict[str, Any]]:
    """Shared jurisdiction IN/eq filter for Case.stationId or PoliceStation.id."""
    role = officer.get("role")
    level = scope_level_for(role)
    col = f'{alias}.{id_column}'

    if level == "STATE":
        return "", {}

    if level == "COMMAND_RANGE":
        cr = officer.get("commandRangeId")
        if not cr:
            return " AND 1=0", {}
        return (
            f'''
            AND {col} IN (
              SELECT ps.id FROM "PoliceStation" ps
              JOIN "District" d ON ps."districtId" = d.id
              WHERE d."commandRangeId" = %(jCommandRangeId)s
            )
            ''',
            {"jCommandRangeId": cr},
        )

    if level == "DISTRICTS":
        ids = officer.get("districtIds") or []
        if not ids and officer.get("districtId"):
            ids = [officer["districtId"]]
        if not ids:
            return " AND 1=0", {}
        return (
            f'''
            AND {col} IN (
              SELECT ps.id FROM "PoliceStation" ps
              WHERE ps."districtId" = ANY(%(jDistrictIds)s)
            )
            ''',
            {"jDistrictIds": list(ids)},
        )

    if level == "DISTRICT":
        did = officer.get("districtId")
        if not did:
            return " AND 1=0", {}
        return (
            f'''
            AND {col} IN (
              SELECT ps.id FROM "PoliceStation" ps
              WHERE ps."districtId" = %(jDistrictId)s
            )
            ''',
            {"jDistrictId": did},
        )

    if level == "SUBDIVISION":
        rid = officer.get("rangeId")
        if not rid:
            return " AND 1=0", {}
        return (
            f'''
            AND {col} IN (
              SELECT ps.id FROM "PoliceStation" ps
              WHERE ps."rangeId" = %(jRangeId)s
            )
            ''',
            {"jRangeId": rid},
        )

    station_id = officer.get("stationId")
    if not station_id:
        return " AND 1=0", {}
    return f" AND {col} = %(stationId)s", {"stationId": station_id}


def station_filter_sql(is_sp: bool, station_id: str | None, alias: str = "c") -> tuple[str, dict[str, Any]]:
    """Legacy helper: is_sp True means no station filter."""
    if is_sp or not station_id:
        return "", {}
    return f' AND {alias}."stationId" = %(stationId)s', {"stationId": station_id}


def jurisdiction_filter_sql(officer: dict[str, Any], alias: str = "c") -> tuple[str, dict[str, Any]]:
    """Scope Case/Alert rows to the officer's chart jurisdiction."""
    return _jurisdiction_scope_sql(officer, alias, '"stationId"')


def jurisdiction_station_filter_sql(officer: dict[str, Any], alias: str = "ps") -> tuple[str, dict[str, Any]]:
    """Scope PoliceStation rows to the officer's chart jurisdiction."""
    return _jurisdiction_scope_sql(officer, alias, "id")


def station_in_jurisdiction(officer: dict[str, Any], station_id: str) -> bool:
    scope_sql, scope_params = jurisdiction_station_filter_sql(officer, alias="ps")
    if not scope_sql:
        return True
    row = fetch_one(
        f'SELECT 1 FROM "PoliceStation" ps WHERE ps.id = %(stationId)s{scope_sql}',
        {"stationId": station_id, **scope_params},
    )
    return row is not None


def person_in_scope_sql_for_officer(officer: dict[str, Any], person_alias: str = "p") -> tuple[str, dict[str, Any]]:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    if not scope_sql:
        return "", {}
    return (
        f'''
        AND EXISTS (
            SELECT 1 FROM "CasePerson" cp
            JOIN "Case" c ON cp."caseId" = c.id
            WHERE cp."personId" = {person_alias}.id{scope_sql}
        )
        ''',
        scope_params,
    )


def person_in_scope_sql(is_sp: bool, station_id: str | None, person_alias: str = "p") -> tuple[str, dict[str, Any]]:
    if is_sp or not station_id:
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


_OFFICER_SELECT = '''
    SELECT o.id, o."badgeId", o."passwordHash", o.name, o.role, o."stationId",
           o.email, o."districtId" AS "officerDistrictId", o."rangeId",
           o."commandRangeId",
           o."reportingOfficerId", o."hierarchyPath"::text AS "hierarchyPath",
           o.status, o."createdById",
           ps."districtId" AS "stationDistrictId",
           ps.name AS "stationName",
           COALESCE(d_o.name, d_ps.name) AS "districtName"
    FROM "Officer" o
    LEFT JOIN "PoliceStation" ps ON o."stationId" = ps.id
    LEFT JOIN "District" d_ps ON ps."districtId" = d_ps.id
    LEFT JOIN "District" d_o ON o."districtId" = d_o.id
'''


def _load_district_ids(officer_id: str) -> list[str]:
    rows = fetch_all(
        'SELECT "districtId" FROM "OfficerDistrict" WHERE "officerId" = %(id)s',
        {"id": officer_id},
    )
    return [r["districtId"] for r in rows]


def _normalize_officer_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    district_id = row.get("officerDistrictId") or row.get("stationDistrictId")
    path = row.get("hierarchyPath")
    if path is not None and not isinstance(path, str):
        path = str(path)
    officer_id = row["id"]
    district_ids = _load_district_ids(officer_id)
    if not district_ids and district_id:
        district_ids = [district_id]
    return {
        **row,
        "districtId": district_id,
        "hierarchyPath": path,
        "status": row.get("status") or "ACTIVE",
        "commandRangeId": row.get("commandRangeId"),
        "districtIds": district_ids,
    }


def load_officer_by_id(officer_id: str) -> dict[str, Any] | None:
    return _normalize_officer_row(
        fetch_one(
            _OFFICER_SELECT + " WHERE o.id = %(id)s",
            {"id": officer_id},
        )
    )


def load_officer_by_badge(badge_id: str) -> dict[str, Any] | None:
    return _normalize_officer_row(
        fetch_one(
            _OFFICER_SELECT + ' WHERE o."badgeId" = %(badgeId)s',
            {"badgeId": badge_id},
        )
    )


def load_officer_by_email(email: str) -> dict[str, Any] | None:
    return _normalize_officer_row(
        fetch_one(
            _OFFICER_SELECT + " WHERE LOWER(o.email) = LOWER(%(email)s)",
            {"email": email},
        )
    )


def officer_user_payload(officer: dict[str, Any]) -> dict[str, Any]:
    caps = platform_capabilities(officer)
    return {
        "id": officer["id"],
        "badgeId": officer["badgeId"],
        "name": officer["name"],
        "role": officer["role"],
        "stationId": officer.get("stationId"),
        "districtId": officer.get("districtId"),
        "rangeId": officer.get("rangeId"),
        "commandRangeId": officer.get("commandRangeId"),
        "districtIds": officer.get("districtIds") or [],
        "email": officer.get("email"),
        "status": officer.get("status") or "ACTIVE",
        "hierarchyPath": officer.get("hierarchyPath"),
        "reportingOfficerId": officer.get("reportingOfficerId"),
        "stationName": officer.get("stationName"),
        "districtName": officer.get("districtName"),
        "mustChangePassword": (officer.get("status") or "") == "MUST_CHANGE_PASSWORD",
        "capabilities": caps,
    }


def require_case_write(officer: dict[str, Any]) -> None:
    from fastapi import HTTPException

    if is_police_it(officer.get("role")) or not platform_capabilities(officer).get("canWriteCases"):
        raise HTTPException(status_code=403, detail="Your role cannot create or modify cases")


def get_case_with_relations(case_id: str, officer: dict[str, Any]) -> dict[str, Any] | None:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
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
               p.id AS "person_id", p.name, p.role AS "personRole", p.phone, p.address, p."custodyStartDate"
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
                "custodyStartDate": cp.get("custodyStartDate"),
            },
        }
        for cp in case_persons
    ]
    case_row["matches"] = matches
    case_row["station"] = {"name": case_row.pop("stationName", None)}
    return case_row
