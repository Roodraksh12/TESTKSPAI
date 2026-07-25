from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import get_current_user
from app.services import analytics
from app.services.case_access import jurisdiction_filter_sql
from app.services.db import execute, fetch_all, fetch_scalar
from app.services.hierarchy import is_police_it
from app.services.warning_engine import WARNING_SOURCE, refresh_hotspot_warnings_if_due

router = APIRouter(prefix="/api/early-warnings", tags=["early-warnings"])


def _officer_with_access(current_user: dict) -> dict:
    officer = current_user["officer"]
    if is_police_it(officer.get("role")):
        raise HTTPException(
            status_code=403,
            detail="Early warnings are available only to operational police roles",
        )
    return officer


def _active_where(officer: dict, alias: str = "a") -> tuple[str, dict]:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias=alias)
    return (
        f'''
        {alias}.source = %(warningSource)s
        AND {alias}.status = 'ACTIVE'
        AND ({alias}."expiresAt" IS NULL OR {alias}."expiresAt" > NOW())
        {scope_sql}
        ''',
        {"warningSource": WARNING_SOURCE, **scope_params},
    )


@router.get("")
def list_early_warnings(
    limit: int = Query(default=50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = _officer_with_access(current_user)
    # All connected clients poll this endpoint; a process-level throttle permits
    # only one global refresh per minute while each response remains uncached.
    refresh_hotspot_warnings_if_due()
    where_sql, params = _active_where(officer)
    query_params = {**params, "officerId": officer["id"], "limit": limit}
    warnings = fetch_all(
        f'''
        SELECT a.id, a.type, a."stationId", ps.name AS "stationName",
               a."zoneLabel", a."riskScore", a.reason, a.action,
               a.latitude, a.longitude, a."crimeType", a.severity,
               a.status, a.source, a.evidence, a."firstDetectedAt",
               a."lastDetectedAt", a."expiresAt", a."createdAt",
               (ar."readAt" IS NOT NULL) AS "isRead", ar."readAt"
        FROM "Alert" a
        JOIN "PoliceStation" ps ON ps.id = a."stationId"
        LEFT JOIN "AlertRead" ar
          ON ar."alertId" = a.id AND ar."officerId" = %(officerId)s
        WHERE {where_sql}
        ORDER BY
          CASE a.severity WHEN 'CRITICAL' THEN 3 WHEN 'HIGH' THEN 2 ELSE 1 END DESC,
          a."riskScore" DESC,
          a."lastDetectedAt" DESC
        LIMIT %(limit)s
        ''',
        query_params,
    )
    unread_count = fetch_scalar(
        f'''
        SELECT COUNT(*)
        FROM "Alert" a
        WHERE {where_sql}
          AND NOT EXISTS (
            SELECT 1 FROM "AlertRead" ar
            WHERE ar."alertId" = a.id AND ar."officerId" = %(officerId)s
          )
        ''',
        {**params, "officerId": officer["id"]},
    )
    return {
        "warnings": warnings,
        "unreadCount": int(unread_count or 0),
        "forecast": analytics.get_risk_forecast(officer),
        "pollAfterSeconds": 20,
    }


@router.post("/{warning_id}/read")
def mark_warning_read(
    warning_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = _officer_with_access(current_user)
    where_sql, params = _active_where(officer)
    exists = fetch_scalar(
        f'SELECT 1 FROM "Alert" a WHERE a.id = %(warningId)s AND {where_sql}',
        {"warningId": warning_id, **params},
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Early warning not found")
    execute(
        '''
        INSERT INTO "AlertRead" ("officerId", "alertId", "readAt")
        VALUES (%(officerId)s, %(alertId)s, NOW())
        ON CONFLICT ("officerId", "alertId")
        DO UPDATE SET "readAt" = EXCLUDED."readAt"
        ''',
        {"officerId": officer["id"], "alertId": warning_id},
    )
    return {"success": True, "warningId": warning_id}


@router.post("/read-all")
def mark_all_warnings_read(current_user: dict = Depends(get_current_user)) -> dict:
    officer = _officer_with_access(current_user)
    where_sql, params = _active_where(officer)
    execute(
        f'''
        INSERT INTO "AlertRead" ("officerId", "alertId", "readAt")
        SELECT %(officerId)s, a.id, NOW()
        FROM "Alert" a
        WHERE {where_sql}
        ON CONFLICT ("officerId", "alertId")
        DO UPDATE SET "readAt" = EXCLUDED."readAt"
        ''',
        {"officerId": officer["id"], **params},
    )
    return {"success": True}
