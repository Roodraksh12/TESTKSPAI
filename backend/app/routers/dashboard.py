from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services import deadline_engine
from app.services.case_access import station_filter_sql
from app.services.db import run_on_connection, serialize_row, serialize_rows
from app.services.parallel import analytics_cache, gather

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

            # AI-suggested links still awaiting a human decision. These are the
            # officer's queue: nothing acts on a match until it's confirmed.
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

            return (
                total_cases,
                clearance_rate,
                high_risk_alerts,
                recent_cases,
                pending_matches,
                open_cases,
            )

    # The counts batch and the compliance board are independent, so they run
    # side by side rather than one after the other — against a remote database
    # that halves the page's time-to-first-paint. The result is then cached so
    # returning to the landing tab is instant; creating a case clears it.
    parts = analytics_cache.get_or_compute(
        ("dashboard", is_sp, officer["stationId"]),
        lambda: gather(
            {
                "counts": lambda: run_on_connection(_load),
                "board": lambda: deadline_engine.get_compliance_board(is_sp, officer["stationId"]),
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
    ) = parts["counts"] or (0, 0, 0, [], 0, 0)

    # Statutory clock exposure — the one number on this screen with a legal
    # deadline attached, so it leads the "needs attention" block.
    summary = (parts["board"] or {}).get("summary", {})

    return {
        "officer": {
            "name": officer.get("name"),
            "badgeId": officer.get("badgeId"),
            "role": officer.get("role"),
            "stationName": officer.get("stationName"),
            "districtName": officer.get("districtName"),
            # Spelling out the visibility rule makes RBAC legible instead of
            # leaving an officer wondering why a case isn't in their list.
            "scopeLabel": (
                f'{officer.get("districtName") or "District"} — all stations'
                if is_sp
                else f'{officer.get("stationName") or "Your station"} only'
            ),
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
    }
