from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services import analytics
from app.services.case_access import jurisdiction_filter_sql
from app.services.db import fetch_all
from app.services.parallel import analytics_cache, gather

router = APIRouter(prefix="/api", tags=["hotspots"])


def _load_alerts(officer: dict) -> list[dict]:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="a")
    alerts = fetch_all(
        f'''
        SELECT a.*, ps.name AS "stationName"
        FROM "Alert" a
        LEFT JOIN "PoliceStation" ps ON a."stationId" = ps.id
        WHERE a.status = 'ACTIVE'
          AND (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
          {scope_sql}
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
    cache_key = ("hotspots", officer["id"], officer.get("role"))

    def build() -> dict:
        parts = gather(
            {
                "alerts": lambda: _load_alerts(officer),
                "clusters": lambda: analytics.get_hotspot_clusters(officer),
                "dailyVolume": lambda: analytics.get_daily_case_volume(officer, days=7),
                "summary": lambda: analytics.get_high_risk_summary(officer),
            }
        )
        daily = parts.get("dailyVolume") or []
        return {
            "alerts": parts.get("alerts") or [],
            "clusters": parts.get("clusters") or [],
            "dailyVolume": daily,
            "sparklinePath": analytics.sparkline_paths(daily),
            "summary": parts.get("summary") or {},
        }

    return analytics_cache.get_or_compute(cache_key, build)


def _case_mix(officer: dict) -> dict:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
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
    cache_key = ("analytics", officer["id"], officer.get("role"))

    def build() -> dict:
        parts = gather(
            {
                "mix": lambda: _case_mix(officer),
                "highRisk": lambda: analytics.get_high_risk_summary(officer),
                "trend": lambda: analytics.get_crime_trend(officer),
                "forecast": lambda: analytics.get_risk_forecast(officer),
                "earlyWarnings": lambda: analytics.get_early_warnings(officer),
                "dailyVolume": lambda: analytics.get_daily_case_volume(officer, days=7),
            }
        )
        mix = parts["mix"] or {"byType": {}, "total": 0, "clearanceRate": 0}
        high_risk = parts["highRisk"] or {}
        return {
            "metrics": {
                "totalCases": mix["total"],
                "clearanceRate": mix["clearanceRate"],
                "highRiskZones": high_risk.get("highRiskZones", 0),
                "openAlerts": high_risk.get("openAlerts", 0),
                "topZone": high_risk.get("topZone"),
                "byType": mix["byType"],
                "crimeTypeBreakdown": mix["byType"],
            },
            "trend": parts["trend"] or {"data": [], "series": []},
            "forecast": parts["forecast"] or {"axes": [], "baseline": 50},
            "earlyWarnings": parts["earlyWarnings"] or [],
            "dailyVolume": parts["dailyVolume"] or [],
        }

    return analytics_cache.get_or_compute(cache_key, build)
