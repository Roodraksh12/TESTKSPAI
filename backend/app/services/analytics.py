from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services import deadline_engine
from app.services.case_access import station_filter_sql
from app.services.db import fetch_all, fetch_scalar

# Every number here comes from a DB query — no hardcoded arrays, no random().

MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
TREND_SERIES_COLORS = ["var(--teal)", "var(--amber)", "var(--danger)", "var(--ink-2)"]
VELOCITY_BASELINE_WEEKS = 8
HOTSPOT_GRID_DEG = 0.01


def _parse_dt(value: Any) -> datetime:
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _slug(crime_type: str) -> str:
    return crime_type.lower().replace(" ", "_")


def _months_window(now: datetime, count: int = 6) -> list[tuple[int, int]]:
    months: list[tuple[int, int]] = []
    year, month = now.year, now.month
    for _ in range(count):
        months.append((year, month))
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(months))


def get_crime_trend(is_sp: bool, station_id: str) -> dict[str, Any]:
    scope_sql, scope_params = station_filter_sql(is_sp, station_id, alias="c")
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=183)
    rows = fetch_all(
        f'''
        SELECT "crimeType", "incidentDate"
        FROM "Case" c
        WHERE c."incidentDate" >= %(windowStart)s{scope_sql}
        ''',
        {"windowStart": window_start, **scope_params},
    )

    type_counts: dict[str, int] = defaultdict(int)
    for row in rows:
        type_counts[row["crimeType"]] += 1
    top_types = sorted(type_counts, key=lambda t: type_counts[t], reverse=True)[:4]
    if not top_types:
        return {"data": [], "series": []}

    months = _months_window(now, 6)
    buckets: dict[tuple[int, int], dict[str, int]] = {key: defaultdict(int) for key in months}
    for row in rows:
        if row["crimeType"] not in top_types:
            continue
        incident_date = _parse_dt(row["incidentDate"])
        key = (incident_date.year, incident_date.month)
        if key in buckets:
            buckets[key][row["crimeType"]] += 1

    data = []
    for year, month in months:
        entry: dict[str, Any] = {"month": MONTH_LABELS[month - 1]}
        for crime_type in top_types:
            entry[_slug(crime_type)] = buckets[(year, month)].get(crime_type, 0)
        data.append(entry)

    series = [
        {"key": _slug(crime_type), "label": crime_type, "color": TREND_SERIES_COLORS[i % len(TREND_SERIES_COLORS)]}
        for i, crime_type in enumerate(top_types)
    ]
    return {"data": data, "series": series}


def compute_crime_velocity(is_sp: bool, station_id: str) -> list[dict[str, Any]]:
    scope_sql, scope_params = station_filter_sql(is_sp, station_id, alias="c")
    now = datetime.now(timezone.utc)
    recent_start = now - timedelta(days=7)
    baseline_start = now - timedelta(days=7 + VELOCITY_BASELINE_WEEKS * 7)

    rows = fetch_all(
        f'''
        SELECT "crimeType", "reportedDate"
        FROM "Case" c
        WHERE c."reportedDate" >= %(baselineStart)s{scope_sql}
        ''',
        {"baselineStart": baseline_start, **scope_params},
    )

    recent_counts: dict[str, int] = defaultdict(int)
    baseline_counts: dict[str, int] = defaultdict(int)
    for row in rows:
        reported = _parse_dt(row["reportedDate"])
        crime_type = row["crimeType"]
        if reported >= recent_start:
            recent_counts[crime_type] += 1
        else:
            baseline_counts[crime_type] += 1

    results = []
    for crime_type in set(recent_counts) | set(baseline_counts):
        recent_count = recent_counts.get(crime_type, 0)
        baseline_weekly = baseline_counts.get(crime_type, 0) / VELOCITY_BASELINE_WEEKS
        if baseline_weekly == 0:
            risk = 70 if recent_count > 0 else 15
        else:
            risk = min(max(round(recent_count / baseline_weekly * 50), 5), 99)
        results.append(
            {
                "crimeType": crime_type,
                "recentCount": recent_count,
                "baselineWeekly": round(baseline_weekly, 2),
                "risk": risk,
            }
        )

    results.sort(key=lambda r: r["risk"], reverse=True)
    return results


def get_risk_forecast(is_sp: bool, station_id: str) -> dict[str, Any]:
    top5 = compute_crime_velocity(is_sp, station_id)[:5]
    axes = [{"crimeType": v["crimeType"], "risk": v["risk"]} for v in top5]
    return {"axes": axes, "baseline": 50}


def get_hotspot_clusters(is_sp: bool, station_id: str) -> list[dict[str, Any]]:
    scope_sql, scope_params = station_filter_sql(is_sp, station_id, alias="c")
    rows = fetch_all(
        f'''
        SELECT "crimeType", latitude, longitude
        FROM "Case" c
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL{scope_sql}
        ''',
        scope_params,
    )

    cells: dict[tuple[int, int], dict[str, Any]] = {}
    for row in rows:
        lat, lng = row["latitude"], row["longitude"]
        cell_key = (round(lat / HOTSPOT_GRID_DEG), round(lng / HOTSPOT_GRID_DEG))
        cell = cells.setdefault(cell_key, {"lats": [], "lngs": [], "typeCounts": defaultdict(int)})
        cell["lats"].append(lat)
        cell["lngs"].append(lng)
        cell["typeCounts"][row["crimeType"]] += 1

    clusters = []
    for cell in cells.values():
        count = len(cell["lats"])
        top_type = max(cell["typeCounts"], key=lambda t: cell["typeCounts"][t])
        if count >= 3:
            intensity, radius = "high", 28
        elif count == 2:
            intensity, radius = "medium", 20
        else:
            intensity, radius = "low", 14
        clusters.append(
            {
                "lat": sum(cell["lats"]) / count,
                "lng": sum(cell["lngs"]) / count,
                "count": count,
                "intensity": intensity,
                "label": f"{top_type} cluster ({count})",
                "radius": radius,
            }
        )

    clusters.sort(key=lambda c: c["count"], reverse=True)
    return clusters


def get_early_warnings(is_sp: bool, station_id: str, take: int = 6) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []

    scope_sql, scope_params = station_filter_sql(is_sp, station_id, alias="a")
    alerts = fetch_all(
        f'''
        SELECT a.type, a."zoneLabel", a."riskScore", a.reason
        FROM "Alert" a
        WHERE 1=1{scope_sql}
        ORDER BY a."riskScore" DESC
        ''',
        scope_params,
    )
    for alert in alerts:
        warnings.append(
            {
                "type": alert["type"],
                "probability": alert["riskScore"],
                "location": alert["zoneLabel"],
                "timeframe": "Ongoing",
                "reasoning": alert["reason"],
                "action": "Increase patrol presence in the flagged zone.",
                "urgency": "high" if alert["riskScore"] >= 80 else "medium",
            }
        )

    for v in compute_crime_velocity(is_sp, station_id):
        if v["risk"] >= 65 and v["recentCount"] >= 2:
            warnings.append(
                {
                    "type": "ANOMALY",
                    "probability": v["risk"],
                    "location": "District-wide" if is_sp else "Station jurisdiction",
                    "timeframe": "Next 7 days",
                    "reasoning": (
                        f'{v["recentCount"]} {v["crimeType"]} cases in the last 7 days '
                        f'vs a baseline of {v["baselineWeekly"]:.1f}/week.'
                    ),
                    "action": f'Increase patrols for {v["crimeType"]} hotspots.',
                    "urgency": "high" if v["risk"] >= 80 else "medium",
                }
            )

    deadline_added = 0
    for risk in deadline_engine.get_deadline_risks(is_sp, station_id, take=10):
        if deadline_added >= 3:
            break
        if risk["tier"] not in ("OVERDUE", "URGENT"):
            continue
        warnings.append(
            {
                "type": "DEADLINE",
                "probability": 95 if risk["tier"] == "OVERDUE" else 85,
                "location": risk["firNumber"],
                "timeframe": f'{abs(risk["daysLeft"])} days {"overdue" if risk["daysLeft"] < 0 else "remaining"}',
                "reasoning": (
                    f'{risk["firNumber"]} ({risk["crimeType"]}) is {risk["tier"].lower()} '
                    f'on the {risk["statute"]} charge-sheet clock.'
                ),
                "action": "Prioritise charge-sheet filing to avoid default bail.",
                "urgency": "high",
            }
        )
        deadline_added += 1

    warnings.sort(key=lambda w: w["probability"], reverse=True)
    return warnings[:take]


def get_high_risk_summary(is_sp: bool, station_id: str) -> dict[str, Any]:
    scope_sql, scope_params = station_filter_sql(is_sp, station_id, alias="a")
    high_risk_zones = fetch_scalar(
        f'SELECT COUNT(*) FROM "Alert" a WHERE a."riskScore" >= 70{scope_sql}',
        scope_params,
    )
    open_alerts = fetch_scalar(f'SELECT COUNT(*) FROM "Alert" a WHERE 1=1{scope_sql}', scope_params)
    top = fetch_all(
        f'''
        SELECT a."zoneLabel", a."riskScore"
        FROM "Alert" a
        WHERE 1=1{scope_sql}
        ORDER BY a."riskScore" DESC
        LIMIT 1
        ''',
        scope_params,
    )
    top_zone = (
        {"zoneLabel": top[0]["zoneLabel"], "riskScore": round(float(top[0]["riskScore"] or 0))}
        if top
        else None
    )
    return {
        "highRiskZones": int(high_risk_zones or 0),
        "openAlerts": int(open_alerts or 0),
        "topZone": top_zone,
    }


def get_daily_case_volume(is_sp: bool, station_id: str, days: int = 7) -> list[dict[str, Any]]:
    scope_sql, scope_params = station_filter_sql(is_sp, station_id, alias="c")
    now = datetime.now(timezone.utc)
    window_start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = fetch_all(
        f'''
        SELECT "reportedDate"
        FROM "Case" c
        WHERE c."reportedDate" >= %(windowStart)s{scope_sql}
        ''',
        {"windowStart": window_start, **scope_params},
    )

    counts: dict[str, int] = defaultdict(int)
    for row in rows:
        counts[_parse_dt(row["reportedDate"]).date().isoformat()] += 1

    return [
        {"date": (window_start + timedelta(days=i)).date().isoformat(), "count": counts.get((window_start + timedelta(days=i)).date().isoformat(), 0)}
        for i in range(days)
    ]
