from __future__ import annotations

from typing import Any

from app.services.case_access import create_audit_log
from app.services.db import fetch_all

# Only these client-triggered (browser-side PDF export) actions may be written
# via the public audit endpoint — never let a client write arbitrary rows.
ALLOWED_CLIENT_ACTIONS = {"EXPORT_CHAT_PDF", "EXPORT_CASE_PDF", "EXPORT_NETWORK_PDF"}


def list_audit_logs(officer: dict[str, Any]) -> list[dict[str, Any]]:
    role = officer.get("role")
    where = ""
    params: dict[str, Any] = {}
    if role == "SP":
        pass
    elif role == "INSPECTOR":
        where = ' AND o."stationId" = %(stationId)s'
        params["stationId"] = officer["stationId"]
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
        JOIN "PoliceStation" ps ON o."stationId" = ps.id
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
