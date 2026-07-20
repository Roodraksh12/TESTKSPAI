from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services import analytics
from app.services.case_access import station_filter_sql
from app.services.db import fetch_all
from app.services.parallel import analytics_cache, gather

router = APIRouter(prefix="/api", tags=["hotspots"])


def _load_alerts(is_sp: bool, station_id: str) -> list[dict]:
    scope_sql, scope_params = station_filter_sql(is_sp, station_id, alias="a")
    alerts = fetch_all(
        f'''
        SELECT a.*, ps.name AS "stationName"
        FROM "Alert" a
        LEFT JOIN "PoliceStation" ps ON a."stationId" = ps.id
        WHERE 1=1{scope_sql}
        ORDER BY a."riskScore" DESC
        ''',
        scope_params,
    )
    for alert in alerts:
        alert["station"] = {"name": alert.pop("stationName", None)}
    return alerts


@router.get("/hotspots")
def hotspots(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    station_id = officer["stationId"]

    def build() -> dict:
        # Four independent aggregates — issued together rather than one after
        # another, which is the difference between ~1.2s and ~0.3s here.
        return gather(
            {
                "alerts": lambda: _load_alerts(is_sp, station_id),
                "clusters": lambda: analytics.get_hotspot_clusters(is_sp, station_id),
                "dailyVolume": lambda: analytics.get_daily_case_volume(is_sp, station_id, days=7),
                "summary": lambda: analytics.get_high_risk_summary(is_sp, station_id),
            }
        )

    return analytics_cache.get_or_compute(("hotspots", is_sp, station_id), build)


def _case_mix(is_sp: bool, station_id: str) -> dict:
    scope_sql, scope_params = station_filter_sql(is_sp, station_id, alias="c")
    cases = fetch_all(
        f'SELECT c."crimeType", c.status FROM "Case" c WHERE 1=1{scope_sql}',
        scope_params,
    )
    by_type: dict[str, int] = {}
    for case in cases:
        crime_type = case["crimeType"]
        by_type[crime_type] = by_type.get(crime_type, 0) + 1

    closed = len([case for case in cases if case["status"] in ("CHARGESHEETED", "CLOSED")])
    total = len(cases)
    return {
        "byType": by_type,
        "total": total,
        "clearanceRate": round((closed / total) * 100, 1) if total else 0,
    }


@router.get("/analytics")
def analytics_endpoint(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    station_id = officer["stationId"]

    def build() -> dict:
        parts = gather(
            {
                "mix": lambda: _case_mix(is_sp, station_id),
                "highRisk": lambda: analytics.get_high_risk_summary(is_sp, station_id),
                "trend": lambda: analytics.get_crime_trend(is_sp, station_id),
                "forecast": lambda: analytics.get_risk_forecast(is_sp, station_id),
                "earlyWarnings": lambda: analytics.get_early_warnings(is_sp, station_id),
                "dailyVolume": lambda: analytics.get_daily_case_volume(is_sp, station_id, days=7),
            }
        )

        mix = parts["mix"] or {"byType": {}, "total": 0, "clearanceRate": 0}
        high_risk = parts["highRisk"] or {"highRiskZones": 0, "topZone": None}

        return {
            "metrics": {
                "totalCases": mix["total"],
                "clearanceRate": mix["clearanceRate"],
                "crimeTypeBreakdown": mix["byType"],
                "highRiskZones": high_risk["highRiskZones"],
                "topZone": high_risk["topZone"],
            },
            "trend": parts["trend"] or {"data": [], "series": []},
            "forecast": parts["forecast"] or {"axes": [], "baseline": 0},
            "earlyWarnings": parts["earlyWarnings"] or [],
            "dailyVolume": parts["dailyVolume"] or [],
        }

    return analytics_cache.get_or_compute(("analytics", is_sp, station_id), build)
