"""Explainable hotspot detection and persisted early-warning lifecycle."""

from __future__ import annotations

import hashlib
import json
import threading
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.case_access import jurisdiction_filter_sql
from app.services.db import fetch_all, get_conn, new_id

GRID_DEGREES = 0.01
CURRENT_WINDOW_DAYS = 7
BASELINE_WINDOW_DAYS = 28
MIN_CURRENT_CASES = 3
MIN_GROWTH_RATIO = 0.50
WARNING_SOURCE = "HOTSPOT_ENGINE"
REFRESH_INTERVAL_SECONDS = 60

_refresh_lock = threading.Lock()
_last_refresh: datetime | None = None


def _parse_datetime(value: Any) -> datetime:
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _fingerprint(station_id: str, grid_lat: int, grid_lng: int, crime_type: str) -> str:
    value = f"{station_id}|{grid_lat}|{grid_lng}|{crime_type.strip().lower()}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def _risk_score(
    current_count: int,
    baseline_weekly: float,
    concentration: float,
    latest_reported: datetime,
    now: datetime,
) -> int:
    volume_score = min(30.0, current_count * 5.0)
    if baseline_weekly <= 0:
        growth_score = 30.0
    else:
        growth_ratio = max(0.0, (current_count - baseline_weekly) / baseline_weekly)
        growth_score = min(35.0, growth_ratio * 20.0)
    age_days = max(0.0, (now - latest_reported).total_seconds() / 86400)
    recency_score = 15.0 if age_days <= 1 else 10.0 if age_days <= 3 else 5.0
    concentration_score = min(20.0, max(0.0, concentration) * 20.0)
    return min(99, max(1, round(volume_score + growth_score + recency_score + concentration_score)))


def _severity(score: int) -> str:
    if score >= 90:
        return "CRITICAL"
    if score >= 80:
        return "HIGH"
    return "MEDIUM"


def build_hotspot_signals(
    officer: dict[str, Any] | None = None,
    *,
    station_id: str | None = None,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Aggregate recent geocoded cases into station-safe spatial cells.

    The current seven days are compared with the preceding 28 days, normalized
    to a weekly baseline. The same result powers both the map and notifications.
    """
    now = now or datetime.now(timezone.utc)
    current_start = now - timedelta(days=CURRENT_WINDOW_DAYS)
    baseline_start = current_start - timedelta(days=BASELINE_WINDOW_DAYS)
    scope_sql, scope_params = ("", {})
    if officer is not None:
        scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    station_sql = ' AND c."stationId" = %(signalStationId)s' if station_id else ""
    rows = fetch_all(
        f'''
        SELECT c."stationId", ps.name AS "stationName", c."crimeType",
               c.latitude, c.longitude, c."reportedDate"
        FROM "Case" c
        JOIN "PoliceStation" ps ON ps.id = c."stationId"
        WHERE c.latitude IS NOT NULL
          AND c.longitude IS NOT NULL
          AND c."reportedDate" >= %(baselineStart)s
          {station_sql}{scope_sql}
        ''',
        {
            "baselineStart": baseline_start,
            **({"signalStationId": station_id} if station_id else {}),
            **scope_params,
        },
    )

    cells: dict[tuple[str, int, int], dict[str, Any]] = {}
    for row in rows:
        lat = float(row["latitude"])
        lng = float(row["longitude"])
        key = (
            row["stationId"],
            round(lat / GRID_DEGREES),
            round(lng / GRID_DEGREES),
        )
        cell = cells.setdefault(
            key,
            {
                "stationId": row["stationId"],
                "stationName": row["stationName"],
                "gridLat": key[1],
                "gridLng": key[2],
                "current": [],
                "baseline": [],
            },
        )
        item = {**row, "latitude": lat, "longitude": lng, "reported": _parse_datetime(row["reportedDate"])}
        target = "current" if item["reported"] >= current_start else "baseline"
        cell[target].append(item)

    signals: list[dict[str, Any]] = []
    for cell in cells.values():
        current = cell["current"]
        if not current:
            continue
        current_types: dict[str, int] = defaultdict(int)
        baseline_types: dict[str, int] = defaultdict(int)
        for row in current:
            current_types[row["crimeType"]] += 1
        for row in cell["baseline"]:
            baseline_types[row["crimeType"]] += 1
        top_crime = max(current_types, key=current_types.get)
        top_count = current_types[top_crime]
        baseline_weekly = baseline_types.get(top_crime, 0) / (BASELINE_WINDOW_DAYS / 7)
        growth_ratio = None if baseline_weekly == 0 else (top_count - baseline_weekly) / baseline_weekly
        concentration = top_count / len(current)
        latest = max(row["reported"] for row in current)
        score = _risk_score(top_count, baseline_weekly, concentration, latest, now)
        is_warning = top_count >= MIN_CURRENT_CASES and (
            baseline_weekly == 0
            or (growth_ratio is not None and growth_ratio >= MIN_GROWTH_RATIO)
            or top_count >= 6
        )
        if is_warning:
            score = max(65, score)
        lat = sum(row["latitude"] for row in current) / len(current)
        lng = sum(row["longitude"] for row in current) / len(current)
        zone_label = f'{cell["stationName"]} · {top_crime} cluster'
        signals.append(
            {
                "fingerprint": _fingerprint(
                    cell["stationId"], cell["gridLat"], cell["gridLng"], top_crime
                ),
                "stationId": cell["stationId"],
                "stationName": cell["stationName"],
                "crimeType": top_crime,
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "count": len(current),
                "currentCount": top_count,
                "baselineWeekly": round(baseline_weekly, 2),
                "growthRatio": round(growth_ratio, 2) if growth_ratio is not None else None,
                "concentration": round(concentration, 2),
                "latestReportedAt": latest.isoformat(),
                "riskScore": score,
                "severity": _severity(score),
                "isWarning": is_warning,
                "zoneLabel": zone_label,
                "reason": (
                    f"{top_count} {top_crime} cases in the last 7 days versus "
                    f"{baseline_weekly:.1f} per week in the preceding 28-day baseline."
                ),
                "action": f"Review deployment and increase visible patrols for {top_crime} in this grid.",
            }
        )
    signals.sort(key=lambda item: (item["isWarning"], item["riskScore"], item["count"]), reverse=True)
    return signals


def get_hotspot_clusters(officer: dict[str, Any]) -> list[dict[str, Any]]:
    clusters = []
    for signal in build_hotspot_signals(officer):
        count = signal["count"]
        intensity = "high" if signal["isWarning"] or count >= 3 else "medium" if count == 2 else "low"
        clusters.append(
            {
                "lat": signal["lat"],
                "lng": signal["lng"],
                "count": count,
                "intensity": intensity,
                "label": signal["zoneLabel"],
                "radius": 28 if intensity == "high" else 20 if intensity == "medium" else 14,
                "riskScore": signal["riskScore"],
                "stationId": signal["stationId"],
                "crimeType": signal["crimeType"],
                "fingerprint": signal["fingerprint"],
            }
        )
    return clusters


def refresh_hotspot_warnings(*, station_id: str | None = None) -> int:
    """Upsert active warning signals and resolve signals no longer present."""
    started_at = datetime.now(timezone.utc)
    signals = [signal for signal in build_hotspot_signals(station_id=station_id, now=started_at) if signal["isWarning"]]
    expires_at = started_at + timedelta(days=2)

    with get_conn() as conn:
        with conn.cursor() as cur:
            for signal in signals:
                evidence = {
                    "currentWindowDays": CURRENT_WINDOW_DAYS,
                    "baselineWindowDays": BASELINE_WINDOW_DAYS,
                    "currentCount": signal["currentCount"],
                    "baselineWeekly": signal["baselineWeekly"],
                    "growthRatio": signal["growthRatio"],
                    "concentration": signal["concentration"],
                    "latestReportedAt": signal["latestReportedAt"],
                }
                cur.execute(
                    '''
                    INSERT INTO "Alert" (
                      id, "stationId", type, "zoneLabel", "riskScore", reason,
                      fingerprint, latitude, longitude, "crimeType", severity,
                      status, source, action, evidence, "firstDetectedAt",
                      "lastDetectedAt", "expiresAt", "createdAt"
                    )
                    VALUES (
                      %(id)s, %(stationId)s, 'HOTSPOT', %(zoneLabel)s, %(riskScore)s, %(reason)s,
                      %(fingerprint)s, %(latitude)s, %(longitude)s, %(crimeType)s, %(severity)s,
                      'ACTIVE', %(source)s, %(action)s, %(evidence)s::jsonb, %(detectedAt)s,
                      %(detectedAt)s, %(expiresAt)s, %(detectedAt)s
                    )
                    ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL DO UPDATE SET
                      "zoneLabel" = EXCLUDED."zoneLabel",
                      "riskScore" = EXCLUDED."riskScore",
                      reason = EXCLUDED.reason,
                      latitude = EXCLUDED.latitude,
                      longitude = EXCLUDED.longitude,
                      severity = EXCLUDED.severity,
                      status = 'ACTIVE',
                      action = EXCLUDED.action,
                      evidence = EXCLUDED.evidence,
                      "lastDetectedAt" = EXCLUDED."lastDetectedAt",
                      "expiresAt" = EXCLUDED."expiresAt"
                    ''',
                    {
                        "id": new_id(),
                        "stationId": signal["stationId"],
                        "zoneLabel": signal["zoneLabel"],
                        "riskScore": signal["riskScore"],
                        "reason": signal["reason"],
                        "fingerprint": signal["fingerprint"],
                        "latitude": signal["lat"],
                        "longitude": signal["lng"],
                        "crimeType": signal["crimeType"],
                        "severity": signal["severity"],
                        "source": WARNING_SOURCE,
                        "action": signal["action"],
                        "evidence": json.dumps(evidence),
                        "detectedAt": started_at,
                        "expiresAt": expires_at,
                    },
                )
            station_clause = ' AND "stationId" = %(stationId)s' if station_id else ""
            cur.execute(
                f'''
                UPDATE "Alert"
                SET status = 'RESOLVED'
                WHERE source = %(source)s
                  AND status = 'ACTIVE'
                  AND "lastDetectedAt" < %(startedAt)s
                  {station_clause}
                ''',
                {
                    "source": WARNING_SOURCE,
                    "startedAt": started_at,
                    **({"stationId": station_id} if station_id else {}),
                },
            )
        conn.commit()
    return len(signals)


def refresh_hotspot_warnings_if_due() -> int | None:
    """Throttle global refreshes shared by all 20-second client pollers."""
    global _last_refresh
    now = datetime.now(timezone.utc)
    if _last_refresh and (now - _last_refresh).total_seconds() < REFRESH_INTERVAL_SECONDS:
        return None
    if not _refresh_lock.acquire(blocking=False):
        return None
    try:
        now = datetime.now(timezone.utc)
        if _last_refresh and (now - _last_refresh).total_seconds() < REFRESH_INTERVAL_SECONDS:
            return None
        count = refresh_hotspot_warnings()
        _last_refresh = datetime.now(timezone.utc)
        return count
    finally:
        _refresh_lock.release()
