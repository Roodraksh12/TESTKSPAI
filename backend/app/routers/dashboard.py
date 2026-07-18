from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services.case_access import station_filter_sql
from app.services.db import run_on_connection, serialize_row, serialize_rows

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

RECENT_CASE_COLUMNS = '''
    c.id, c."firNumber", c."stationId", c."crimeType", c.status,
    c."incidentDate", c."reportedDate", c.summary
'''


@router.get("")
def dashboard(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    scope_sql, scope_params = station_filter_sql(is_sp, officer["stationId"], alias="c")
    alert_scope_sql, alert_scope_params = station_filter_sql(is_sp, officer["stationId"], alias="a")

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
                WHERE a."riskScore" >= 80{alert_scope_sql}
                ''',
                alert_scope_params,
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
            return total_cases, clearance_rate, high_risk_alerts, recent_cases

    total_cases, clearance_rate, high_risk_alerts, recent_cases = run_on_connection(_load)

    return {
        "stats": {
            "totalCases": total_cases,
            "clearanceRate": clearance_rate,
            "highRiskAlerts": high_risk_alerts,
        },
        "recentCases": recent_cases,
    }
