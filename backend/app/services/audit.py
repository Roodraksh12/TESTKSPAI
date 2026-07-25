from __future__ import annotations

from typing import Any

from app.services.case_access import create_audit_log
from app.services.db import fetch_all
from app.services.hierarchy import has_wide_case_scope, is_police_it, scope_level_for, SHO_RANKS

# Only these client-triggered (browser-side PDF export) actions may be written
# via the public audit endpoint — never let a client write arbitrary rows.
ALLOWED_CLIENT_ACTIONS = {"EXPORT_CHAT_PDF", "EXPORT_CASE_PDF", "EXPORT_NETWORK_PDF"}


def list_audit_logs(officer: dict[str, Any], scope: str = "jurisdiction") -> list[dict[str, Any]]:
    role = officer.get("role")
    where = ""
    params: dict[str, Any] = {}

    if scope == "my":
        where = ' AND al."officerId" = %(officerId)s'
        params["officerId"] = officer["id"]
    elif is_police_it(role) or scope_level_for(role) == "STATE":
        pass
    elif scope_level_for(role) == "COMMAND_RANGE":
        cr = officer.get("commandRangeId")
        path = officer.get("hierarchyPath") or ""
        if cr and path:
            where = ' AND (o."commandRangeId" = %(commandRangeId)s OR o."hierarchyPath" <@ %(path)s::ltree)'
            params["commandRangeId"] = cr
            params["path"] = path
        elif cr:
            where = ' AND o."commandRangeId" = %(commandRangeId)s'
            params["commandRangeId"] = cr
        elif path:
            where = ' AND o."hierarchyPath" <@ %(path)s::ltree'
            params["path"] = path
    elif scope_level_for(role) == "DISTRICTS":
        ids = officer.get("districtIds") or ([] if not officer.get("districtId") else [officer["districtId"]])
        path = officer.get("hierarchyPath") or ""
        if ids and path:
            where = ' AND (o."districtId" = ANY(%(districtIds)s) OR o."hierarchyPath" <@ %(path)s::ltree)'
            params["districtIds"] = list(ids)
            params["path"] = path
        elif ids:
            where = ' AND o."districtId" = ANY(%(districtIds)s)'
            params["districtIds"] = list(ids)
        elif path:
            where = ' AND o."hierarchyPath" <@ %(path)s::ltree'
            params["path"] = path
    elif scope_level_for(role) == "DISTRICT":
        did = officer.get("districtId")
        path = officer.get("hierarchyPath") or ""
        if did and path:
            where = ''' AND (
                o."districtId" = %(districtId)s 
                OR o."stationId" IN (SELECT id FROM "PoliceStation" WHERE "districtId" = %(districtId)s)
                OR o."hierarchyPath" <@ %(path)s::ltree
            )'''
            params["districtId"] = did
            params["path"] = path
        elif did:
            where = ' AND (o."districtId" = %(districtId)s OR o."stationId" IN (SELECT id FROM "PoliceStation" WHERE "districtId" = %(districtId)s))'
            params["districtId"] = did
        elif path:
            where = ' AND o."hierarchyPath" <@ %(path)s::ltree'
            params["path"] = path
    elif scope_level_for(role) == "SUBDIVISION":
        rid = officer.get("rangeId")
        path = officer.get("hierarchyPath") or ""
        if rid and path:
            where = ''' AND (
                o."rangeId" = %(rangeId)s
                OR o."stationId" IN (SELECT id FROM "PoliceStation" WHERE "rangeId" = %(rangeId)s)
                OR o."hierarchyPath" <@ %(path)s::ltree
            )'''
            params["rangeId"] = rid
            params["path"] = path
        elif rid:
            where = ' AND (o."rangeId" = %(rangeId)s OR o."stationId" IN (SELECT id FROM "PoliceStation" WHERE "rangeId" = %(rangeId)s))'
            params["rangeId"] = rid
        elif path:
            where = ' AND o."hierarchyPath" <@ %(path)s::ltree'
            params["path"] = path
    elif role in SHO_RANKS or role == "INSPECTOR":
        sid = officer.get("stationId")
        path = officer.get("hierarchyPath") or ""
        if sid and path:
            where = ' AND (o."stationId" = %(stationId)s OR o."hierarchyPath" <@ %(path)s::ltree)'
            params["stationId"] = sid
            params["path"] = path
        elif sid:
            where = ' AND o."stationId" = %(stationId)s'
            params["stationId"] = sid
        elif path:
            where = ' AND o."hierarchyPath" <@ %(path)s::ltree'
            params["path"] = path
    else:
        where = ' AND al."officerId" = %(officerId)s'
        params["officerId"] = officer["id"]

    return fetch_all(
        f'''
        SELECT al.id, al.action, al."targetType", al."targetId", al.details, al."createdAt",
               o.name AS "officerName", o."badgeId" AS "officerBadgeId", o.role AS "officerRole",
               ps.name AS "stationName"
        FROM "AuditLog" al
        JOIN "Officer" o ON al."officerId" = o.id
        LEFT JOIN "PoliceStation" ps ON o."stationId" = ps.id
        WHERE 1=1{where}
        ORDER BY al."createdAt" DESC
        LIMIT 100
        ''',
        params,
    )


def record_client_event(
    officer: dict[str, Any],
    action: str,
    target_type: str,
    target_id: str | None,
    details: str | None,
) -> None:
    if action not in ALLOWED_CLIENT_ACTIONS:
        raise ValueError(f"Action not whitelisted for client-side logging: {action}")
    create_audit_log(officer["id"], action, target_type, target_id, details)
