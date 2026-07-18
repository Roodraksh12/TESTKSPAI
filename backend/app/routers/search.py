from fastapi import APIRouter, Depends, Query

from app.deps import get_current_user
from app.services.case_access import station_filter_sql
from app.services.db import fetch_all

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
def search(
    q: str = Query(default=""),
    current_user: dict = Depends(get_current_user),
) -> dict:
    if not q.strip():
        return {"cases": [], "suspects": []}

    words = [w for w in q.split() if w]
    if not words:
        return {"cases": [], "suspects": []}

    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    scope_sql, scope_params = station_filter_sql(is_sp, officer["stationId"], alias="c")

    case_clauses = []
    case_params: dict = {**scope_params}
    for idx, word in enumerate(words):
        key = f"w{idx}"
        case_clauses.append(
            f'(c."firNumber" ILIKE %({key})s OR c.summary ILIKE %({key})s OR c."crimeType" ILIKE %({key})s)'
        )
        case_params[key] = f"%{word}%"
    case_where = " OR ".join(case_clauses)

    cases = fetch_all(
        f'''
        SELECT
            c.id, c."firNumber", c."stationId", c."crimeType", c.status,
            c."reportedDate", c.summary,
            ps.name AS "stationName"
        FROM "Case" c
        LEFT JOIN "PoliceStation" ps ON c."stationId" = ps.id
        WHERE ({case_where}){scope_sql}
        ORDER BY c."reportedDate" DESC
        LIMIT 8
        ''',
        case_params,
    )
    for case in cases:
        case["station"] = {"name": case.pop("stationName", None) or "Station"}
    suspect_clauses = []
    suspect_params: dict = {}
    for idx, word in enumerate(words):
        key = f"s{idx}"
        suspect_clauses.append(f'(p.name ILIKE %({key})s OR p.phone ILIKE %({key})s)')
        suspect_params[key] = f"%{word}%"
    suspect_where = " OR ".join(suspect_clauses)

    suspects = fetch_all(
        f'''
        SELECT DISTINCT p.*
        FROM "Person" p
        WHERE {suspect_where}
        LIMIT 8
        ''',
        suspect_params,
    )

    return {"cases": cases, "suspects": suspects}
