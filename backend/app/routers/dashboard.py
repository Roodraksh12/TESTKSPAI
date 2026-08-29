from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services import deadline_engine
from app.services.hierarchy import has_wide_case_scope, platform_capabilities, scope_level_for
from app.services.case_access import jurisdiction_filter_sql
from app.services.db import run_on_connection, serialize_row, serialize_rows
from app.services.parallel import analytics_cache, gather
from app.services.warning_engine import WARNING_SOURCE

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

RECENT_CASE_COLUMNS = '''
    c.id, c."firNumber", c."stationId", c."crimeType", c.status,
    c."incidentDate", c."reportedDate", c.summary
'''


@router.get("")
def dashboard(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    wide_scope = has_wide_case_scope(officer.get("role"))
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    alert_scope_sql, alert_scope_params = jurisdiction_filter_sql(officer, alias="a")
    cache_key = ("dashboard", officer["id"], officer.get("role"))

    def _load(conn):
        with conn.cursor() as cur:
            cur.execute(
                f'''
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (
                        WHERE c.status IN ('CLOSED', 'CHARGESHEETED')
                    )::int AS cleared
                FROM "Case" c
                WHERE 1=1{scope_sql}
                ''',
                scope_params,
            )
            counts = serialize_row(cur.fetchone()) or {}
            total_cases = int(counts.get("total") or 0)
            cleared = int(counts.get("cleared") or 0)
            clearance_rate = int(round((cleared / total_cases) * 100)) if total_cases else 0

            cur.execute(
                f'''
                SELECT COUNT(*) AS total FROM "Alert" a
                WHERE a."riskScore" >= 80
                  AND a.source = %(warningSource)s
                  AND a.status = 'ACTIVE'
                  AND (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
                  {alert_scope_sql}
                ''',
                {"warningSource": WARNING_SOURCE, **alert_scope_params},
            )
            high_risk_alerts = int((serialize_row(cur.fetchone()) or {}).get("total") or 0)

            cur.execute(
                f'''
                SELECT {RECENT_CASE_COLUMNS}
                FROM "Case" c
                WHERE 1=1{scope_sql}
                ORDER BY c."reportedDate" DESC
                LIMIT 5
                ''',
                scope_params,
            )
            recent_cases = serialize_rows(cur.fetchall())

            cur.execute(
                f'''
                SELECT COUNT(*) AS total
                FROM "CaseMatch" cm
                JOIN "Case" c ON c.id = cm."caseId"
                WHERE cm.status = 'PENDING'{scope_sql}
                ''',
                scope_params,
            )
            pending_matches = int((serialize_row(cur.fetchone()) or {}).get("total") or 0)

            cur.execute(
                f'''
                SELECT COUNT(*) AS total
                FROM "Case" c
                WHERE c.status IN ('OPEN', 'UNDER_INVESTIGATION'){scope_sql}
                ''',
                scope_params,
            )
            open_cases = int((serialize_row(cur.fetchone()) or {}).get("total") or 0)

            station_breakdown = []
            if wide_scope:
                cur.execute(
                    f'''
                    SELECT ps.id AS "stationId", ps.name AS "stationName",
                           COUNT(*)::int AS "caseCount",
                           COUNT(*) FILTER (
                             WHERE c.status IN ('OPEN', 'UNDER_INVESTIGATION')
                           )::int AS "openCount"
                    FROM "Case" c
                    JOIN "PoliceStation" ps ON c."stationId" = ps.id
                    WHERE 1=1{scope_sql}
                    GROUP BY ps.id, ps.name
                    ORDER BY "caseCount" DESC
                    LIMIT 12
                    ''',
                    scope_params,
                )
                station_breakdown = serialize_rows(cur.fetchall())

            return (
                total_cases,
                clearance_rate,
                high_risk_alerts,
                recent_cases,
                pending_matches,
                open_cases,
                station_breakdown,
            )

    parts = analytics_cache.get_or_compute(
        cache_key,
        lambda: gather(
            {
                "counts": lambda: run_on_connection(_load),
                "board": lambda: deadline_engine.get_compliance_board(officer),
            }
        ),
    )

    (
        total_cases,
        clearance_rate,
        high_risk_alerts,
        recent_cases,
        pending_matches,
        open_cases,
        station_breakdown,
    ) = parts["counts"] or (0, 0, 0, [], 0, 0, [])

    summary = (parts["board"] or {}).get("summary", {})
    caps = platform_capabilities(officer)
    level = scope_level_for(officer.get("role"))
    if level == "STATE":
        scope_label = "Statewide"
    elif wide_scope:
        scope_label = f'{officer.get("districtName") or caps["scopeLabel"]} — all stations in scope'
    else:
        scope_label = f'{officer.get("stationName") or "Your station"} only'

    return {
        "officer": {
            "name": officer.get("name"),
            "badgeId": officer.get("badgeId"),
            "role": officer.get("role"),
            "stationName": officer.get("stationName"),
            "districtName": officer.get("districtName"),
            "scopeLabel": scope_label,
            "scopeLevel": level,
        },
        "stats": {
            "totalCases": total_cases,
            "clearanceRate": clearance_rate,
            "highRiskAlerts": high_risk_alerts,
            "openCases": open_cases,
        },
        "attention": {
            "overdue": int(summary.get("OVERDUE", 0)),
            "urgent": int(summary.get("URGENT", 0)),
            "watch": int(summary.get("WATCH", 0)),
            "pendingMatches": pending_matches,
            "highRiskAlerts": high_risk_alerts,
        },
        "recentCases": recent_cases,
        "stationBreakdown": station_breakdown,
    }
