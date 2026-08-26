from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.services.case_access import jurisdiction_filter_sql
from app.services.db import fetch_all

KARNATAKA_TIME_ZONE = ZoneInfo("Asia/Kolkata")
MAX_CASE_RESULTS = 25
MAX_BREAKDOWN_ROWS = 50

VALID_CASE_STATUSES = {"OPEN", "UNDER_INVESTIGATION", "CHARGESHEETED", "CLOSED"}
VALID_PERSON_ROLES = {"ACCUSED", "VICTIM", "WITNESS"}
VALID_TIMEFRAMES = {"all_time", "last_7_days", "last_30_days", "this_month", "this_year"}


class QueryValidationError(ValueError):
    pass


@dataclass(frozen=True)
class CaseFilterPlan:
    where_sql: str
    params: dict[str, Any]
    applied_filters: dict[str, Any]


@dataclass(frozen=True)
class Grouping:
    expression: str
    order_by: str


GROUPINGS = {
    "crime_type": Grouping('c."crimeType"', '"caseCount" DESC, label ASC'),
    "status": Grouping("c.status::text", '"caseCount" DESC, label ASC'),
    "station": Grouping("ps.name", '"caseCount" DESC, label ASC'),
    "district": Grouping("d.name", '"caseCount" DESC, label ASC'),
    "month": Grouping(
        "TO_CHAR(c.\"incidentDate\" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')",
        "label ASC",
    ),
    "day_of_week": Grouping(
        "TRIM(TO_CHAR(c.\"incidentDate\" AT TIME ZONE 'Asia/Kolkata', 'Day'))",
        "MIN(EXTRACT(ISODOW FROM c.\"incidentDate\" AT TIME ZONE 'Asia/Kolkata')) ASC",
    ),
    "hour_of_day": Grouping(
        "LPAD(EXTRACT(HOUR FROM c.\"incidentDate\" AT TIME ZONE "
        "'Asia/Kolkata')::int::text, 2, '0') || ':00'",
        "label ASC",
    ),
}


def _text(args: dict[str, Any], key: str) -> str:
    value = args.get(key)
    return str(value).strip() if value is not None else ""


def _parse_calendar_date(value: str, field_name: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise QueryValidationError(f"{field_name} must use YYYY-MM-DD format") from exc


def _local_midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=KARNATAKA_TIME_ZONE).astimezone(timezone.utc)


def resolve_incident_window(
    args: dict[str, Any],
    *,
    now: datetime | None = None,
) -> tuple[datetime | None, datetime | None, dict[str, Any]]:
    """Return an inclusive start and exclusive end for incident timestamps."""

    timeframe = _text(args, "timeframe").lower() or "all_time"
    if timeframe not in VALID_TIMEFRAMES:
        allowed = ", ".join(sorted(VALID_TIMEFRAMES))
        raise QueryValidationError(f"timeframe must be one of: {allowed}")

    date_from = _text(args, "dateFrom")
    date_to = _text(args, "dateTo")
    if timeframe != "all_time" and (date_from or date_to):
        raise QueryValidationError("Use either timeframe or dateFrom/dateTo, not both")

    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(timezone.utc)
    current_local = current.astimezone(KARNATAKA_TIME_ZONE)

    if timeframe == "last_7_days":
        return current - timedelta(days=7), current, {"timeframe": timeframe}
    if timeframe == "last_30_days":
        return current - timedelta(days=30), current, {"timeframe": timeframe}
    if timeframe == "this_month":
        first = date(current_local.year, current_local.month, 1)
        return _local_midnight(first), current, {"timeframe": timeframe}
    if timeframe == "this_year":
        first = date(current_local.year, 1, 1)
        return _local_midnight(first), current, {"timeframe": timeframe}

    start = _local_midnight(_parse_calendar_date(date_from, "dateFrom")) if date_from else None
    # dateTo is inclusive for officers, so the SQL upper bound is the following
    # local midnight and remains exclusive.
    end = (
        _local_midnight(_parse_calendar_date(date_to, "dateTo") + timedelta(days=1))
        if date_to
        else None
    )
    if start and end and start >= end:
        raise QueryValidationError("dateFrom must be on or before dateTo")

    applied: dict[str, Any] = {"timeframe": "all_time"}
    if date_from:
        applied["dateFrom"] = date_from
    if date_to:
        applied["dateTo"] = date_to
    return start, end, applied


def build_case_filter_plan(
    args: dict[str, Any],
    officer: dict[str, Any],
    *,
    now: datetime | None = None,
) -> CaseFilterPlan:
    clauses = ["1=1"]
    params: dict[str, Any] = {}
    applied: dict[str, Any] = {}

    query = _text(args, "query")
    if query:
        clauses.append(
            '''(
                c."firNumber" ILIKE %(query)s
                OR c."crimeType" ILIKE %(query)s
                OR COALESCE(c.summary, '') ILIKE %(query)s
                OR ps.name ILIKE %(query)s
                OR d.name ILIKE %(query)s
                OR EXISTS (
                    SELECT 1
                    FROM "CasePerson" qcp
                    JOIN "Person" qp ON qp.id = qcp."personId"
                    WHERE qcp."caseId" = c.id
                      AND (qp.name ILIKE %(query)s OR COALESCE(qp.phone, '') ILIKE %(query)s)
                )
            )'''
        )
        params["query"] = f"%{query}%"
        applied["query"] = query

    fir_number = _text(args, "firNumber")
    if fir_number:
        clauses.append('c."firNumber" ILIKE %(firNumber)s')
        params["firNumber"] = f"%{fir_number}%"
        applied["firNumber"] = fir_number

    crime_type = _text(args, "crimeType")
    if crime_type:
        clauses.append('c."crimeType" ILIKE %(crimeType)s')
        params["crimeType"] = f"%{crime_type}%"
        applied["crimeType"] = crime_type

    status = _text(args, "status").upper()
    if status:
        if status not in VALID_CASE_STATUSES:
            allowed = ", ".join(sorted(VALID_CASE_STATUSES))
            raise QueryValidationError(f"status must be one of: {allowed}")
        clauses.append("c.status = %(status)s")
        params["status"] = status
        applied["status"] = status

    station_name = _text(args, "stationName")
    if station_name:
        clauses.append("ps.name ILIKE %(stationName)s")
        params["stationName"] = f"%{station_name}%"
        applied["stationName"] = station_name

    district_name = _text(args, "districtName")
    if district_name:
        clauses.append("d.name ILIKE %(districtName)s")
        params["districtName"] = f"%{district_name}%"
        applied["districtName"] = district_name

    person_name = _text(args, "personName")
    person_role = _text(args, "personRole").upper()
    if person_role and person_role not in VALID_PERSON_ROLES:
        allowed = ", ".join(sorted(VALID_PERSON_ROLES))
        raise QueryValidationError(f"personRole must be one of: {allowed}")
    if person_name or person_role:
        person_clauses = ['pcp."caseId" = c.id']
        if person_name:
            person_clauses.append("pp.name ILIKE %(personName)s")
            params["personName"] = f"%{person_name}%"
            applied["personName"] = person_name
        if person_role:
            person_clauses.append("pcp.role = %(personRole)s")
            params["personRole"] = person_role
            applied["personRole"] = person_role
        clauses.append(
            "EXISTS ("
            'SELECT 1 FROM "CasePerson" pcp '
            'JOIN "Person" pp ON pp.id = pcp."personId" '
            f"WHERE {' AND '.join(person_clauses)}"
            ")"
        )

    incident_start, incident_end, window_filters = resolve_incident_window(args, now=now)
    applied.update(window_filters)
    if incident_start:
        clauses.append('c."incidentDate" >= %(incidentStart)s')
        params["incidentStart"] = incident_start
    if incident_end:
        clauses.append('c."incidentDate" < %(incidentEnd)s')
        params["incidentEnd"] = incident_end

    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    params.update(scope_params)
    return CaseFilterPlan(
        where_sql=" AND ".join(clauses) + scope_sql,
        params=params,
        applied_filters=applied,
    )


def _result_limit(value: Any) -> int:
    try:
        parsed = int(value or 10)
    except (TypeError, ValueError) as exc:
        raise QueryValidationError("take must be an integer") from exc
    return max(1, min(parsed, MAX_CASE_RESULTS))


def search_cases(
    args: dict[str, Any],
    officer: dict[str, Any],
) -> list[dict[str, Any]] | dict[str, str]:
    try:
        plan = build_case_filter_plan(args, officer)
        take = _result_limit(args.get("take"))
    except QueryValidationError as exc:
        return {"error": str(exc)}

    return fetch_all(
        f'''
        SELECT
            c.id, c."firNumber", c."stationId", c."crimeType", c.status,
            c."incidentDate", c."reportedDate", c.summary,
            ps.name AS "stationName", d.name AS "districtName",
            ARRAY(
                SELECT p.name || ' (' || cp.role::text || ')'
                FROM "CasePerson" cp
                JOIN "Person" p ON p.id = cp."personId"
                WHERE cp."caseId" = c.id
                ORDER BY p.name
            ) AS "involvedPersons"
        FROM "Case" c
        JOIN "PoliceStation" ps ON ps.id = c."stationId"
        JOIN "District" d ON d.id = ps."districtId"
        WHERE {plan.where_sql}
        ORDER BY c."reportedDate" DESC
        LIMIT %(take)s
        ''',
        {**plan.params, "take": take},
    )


def get_crime_statistics(
    args: dict[str, Any],
    officer: dict[str, Any],
) -> dict[str, Any]:
    group_by = _text(args, "groupBy").lower() or "crime_type"
    grouping = GROUPINGS.get(group_by)
    if not grouping:
        allowed = ", ".join(sorted(GROUPINGS))
        return {"error": f"groupBy must be one of: {allowed}"}

    try:
        plan = build_case_filter_plan(args, officer)
    except QueryValidationError as exc:
        return {"error": str(exc)}

    rows = fetch_all(
        f'''
        SELECT
            {grouping.expression} AS label,
            COUNT(*)::int AS "caseCount",
            (SUM(COUNT(*)) OVER ())::int AS "totalCases",
            ROUND(
                (COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0))::numeric,
                1
            )::double precision AS percentage
        FROM "Case" c
        JOIN "PoliceStation" ps ON ps.id = c."stationId"
        JOIN "District" d ON d.id = ps."districtId"
        WHERE {plan.where_sql}
        GROUP BY {grouping.expression}
        ORDER BY {grouping.order_by}
        LIMIT {MAX_BREAKDOWN_ROWS + 1}
        ''',
        plan.params,
    )

    total_cases = int(rows[0].get("totalCases") or 0) if rows else 0
    truncated = len(rows) > MAX_BREAKDOWN_ROWS
    breakdown = [
        {
            "label": row.get("label") or "Not recorded",
            "caseCount": int(row.get("caseCount") or 0),
            "percentage": float(row.get("percentage") or 0),
        }
        for row in rows[:MAX_BREAKDOWN_ROWS]
    ]
    return {
        "groupBy": group_by,
        "totalCases": total_cases,
        "breakdown": breakdown,
        "truncated": truncated,
        "filters": plan.applied_filters,
        "note": "Counts include only cases within the requesting officer's jurisdiction.",
    }
