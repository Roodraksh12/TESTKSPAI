from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services.case_access import station_filter_sql
from app.services.db import fetch_all

router = APIRouter(prefix="/api", tags=["hotspots"])


@router.get("/hotspots")
def hotspots(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    scope_sql, scope_params = station_filter_sql(is_sp, officer["stationId"], alias="a")
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
    return {"alerts": alerts}


@router.get("/analytics")
def analytics(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    scope_sql, scope_params = station_filter_sql(is_sp, officer["stationId"], alias="c")
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
        "metrics": {
            "totalCases": total,
            "clearanceRate": round((closed / total) * 100, 1) if total else 0,
            "crimeTypeBreakdown": by_type,
        }
    }
