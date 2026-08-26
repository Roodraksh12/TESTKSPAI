from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.routers import early_warnings
from app.routers.early_warnings import _active_where, _officer_with_access
from app.services import warning_engine
from app.services.hierarchy import platform_capabilities


def _case(
    reported_at: datetime,
    *,
    crime_type: str = "Vehicle Theft",
    lat: float = 12.9716,
    lng: float = 77.5946,
) -> dict:
    return {
        "stationId": "station-1",
        "stationName": "Central Station",
        "crimeType": crime_type,
        "latitude": lat,
        "longitude": lng,
        "reportedDate": reported_at.isoformat(),
    }


def test_hotspot_signal_is_explainable_and_stable(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2026, 7, 25, 12, tzinfo=timezone.utc)
    rows = [
        _case(now - timedelta(hours=2)),
        _case(now - timedelta(days=1)),
        _case(now - timedelta(days=2)),
        _case(now - timedelta(days=3)),
        _case(now - timedelta(days=14)),
    ]
    monkeypatch.setattr(warning_engine, "fetch_all", lambda *_args, **_kwargs: rows)

    first = warning_engine.build_hotspot_signals(
        {"role": "INSPECTOR", "stationId": "station-1"}, now=now
    )[0]
    second = warning_engine.build_hotspot_signals(
        {"role": "INSPECTOR", "stationId": "station-1"}, now=now
    )[0]

    assert first["isWarning"] is True
    assert first["currentCount"] == 4
    assert first["baselineWeekly"] == 0.25
    assert first["riskScore"] >= 80
    assert first["fingerprint"] == second["fingerprint"]
    assert "preceding 28-day baseline" in first["reason"]


def test_hotspot_signal_requires_minimum_volume(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2026, 7, 25, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(
        warning_engine,
        "fetch_all",
        lambda *_args, **_kwargs: [_case(now), _case(now - timedelta(days=1))],
    )
    signal = warning_engine.build_hotspot_signals(
        {"role": "CONSTABLE", "stationId": "station-1"}, now=now
    )[0]
    assert signal["isWarning"] is False


def test_refresh_upserts_then_resolves_missing_signals(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(timezone.utc)
    signal = {
        "isWarning": True,
        "fingerprint": "stable-key",
        "stationId": "station-1",
        "zoneLabel": "Central Station · Theft cluster",
        "riskScore": 91,
        "reason": "4 cases versus 0.5 baseline.",
        "lat": 12.97,
        "lng": 77.59,
        "crimeType": "Theft",
        "severity": "CRITICAL",
        "action": "Increase patrols.",
        "currentCount": 4,
        "baselineWeekly": 0.5,
        "growthRatio": 7.0,
        "concentration": 1.0,
        "latestReportedAt": now.isoformat(),
    }
    statements: list[str] = []

    class FakeCursor:
        def execute(self, sql: str, _params: dict) -> None:
            statements.append(sql)

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

    class FakeConnection:
        def cursor(self):
            return FakeCursor()

        def commit(self) -> None:
            statements.append("COMMIT")

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    monkeypatch.setattr(warning_engine, "build_hotspot_signals", lambda **_kwargs: [signal])
    monkeypatch.setattr(warning_engine, "get_conn", fake_connection)
    assert warning_engine.refresh_hotspot_warnings(station_id="station-1") == 1
    assert any("ON CONFLICT (fingerprint)" in sql for sql in statements)
    assert any("SET status = 'RESOLVED'" in sql for sql in statements)
    assert statements[-1] == "COMMIT"


def test_police_it_is_excluded_at_capability_and_api() -> None:
    caps = platform_capabilities({"role": "POLICE_IT"})
    assert caps["nav"]["earlyWarnings"] is False
    with pytest.raises(HTTPException) as exc:
        _officer_with_access({"officer": {"role": "POLICE_IT"}})
    assert exc.value.status_code == 403


def test_warning_scope_fails_closed_without_station() -> None:
    sql, params = _active_where({"role": "CONSTABLE", "stationId": None})
    assert "1=0" in sql
    assert params["warningSource"] == warning_engine.WARNING_SOURCE


def test_warning_list_returns_operational_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    latest = datetime(2026, 8, 24, 10, tzinfo=timezone.utc)
    expires = latest + timedelta(hours=18)
    monkeypatch.setattr(early_warnings, "refresh_hotspot_warnings_if_due", lambda: None)
    monkeypatch.setattr(early_warnings, "_active_where", lambda _officer: ("1=1", {}))
    monkeypatch.setattr(early_warnings, "fetch_all", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(early_warnings, "fetch_scalar", lambda *_args, **_kwargs: 2)
    monkeypatch.setattr(
        early_warnings,
        "fetch_one",
        lambda *_args, **_kwargs: {
            "activeCount": 4,
            "highCriticalCount": 2,
            "affectedStations": 3,
            "expiringSoonCount": 1,
            "latestDetectedAt": latest,
            "nextExpiryAt": expires,
        },
    )

    payload = early_warnings.list_early_warnings(
        limit=50,
        current_user={"officer": {"id": "officer-1", "role": "INSPECTOR"}},
    )

    assert payload["unreadCount"] == 2
    assert payload["summary"] == {
        "activeCount": 4,
        "highCriticalCount": 2,
        "affectedStations": 3,
        "expiringSoonCount": 1,
        "latestDetectedAt": latest,
        "nextExpiryAt": expires,
        "currentWindowDays": warning_engine.CURRENT_WINDOW_DAYS,
        "baselineWindowDays": warning_engine.BASELINE_WINDOW_DAYS,
        "minimumCases": warning_engine.MIN_CURRENT_CASES,
    }


@pytest.mark.parametrize(
    ("role", "geo_key", "geo_value", "expected"),
    [
        ("IGP", "commandRangeId", "cmd-1", "commandRangeId"),
        ("DIG", "districtIds", ["d-1", "d-2"], "jDistrictIds"),
        ("SP", "districtId", "d-1", "jDistrictId"),
        ("DYSP", "rangeId", "r-1", "jRangeId"),
        ("INSPECTOR", "stationId", "s-1", "stationId"),
    ],
)
def test_warning_scope_uses_every_jurisdiction_level(
    role: str,
    geo_key: str,
    geo_value: object,
    expected: str,
) -> None:
    sql, params = _active_where({"role": role, geo_key: geo_value})
    assert expected in sql or expected in params
