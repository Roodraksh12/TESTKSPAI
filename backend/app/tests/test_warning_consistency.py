from __future__ import annotations

import pytest

from app.routers import hotspots
from app.services import analytics, warning_engine


OFFICER = {"id": "officer-1", "role": "INSPECTOR", "stationId": "station-1"}


def test_analytics_warning_feed_uses_only_hotspot_engine_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    def fake_fetch_all(sql: str, params: dict) -> list[dict]:
        captured["sql"] = sql
        captured["params"] = params
        return []

    monkeypatch.setattr(analytics, "fetch_all", fake_fetch_all)

    assert analytics.get_early_warnings(OFFICER) == []
    assert "a.source = %(warningSource)s" in captured["sql"]
    assert captured["params"]["warningSource"] == warning_engine.WARNING_SOURCE


def test_hotspot_alert_feeds_separate_statistical_and_operational_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, dict]] = []

    def fake_fetch_all(sql: str, params: dict) -> list[dict]:
        calls.append((sql, params))
        return []

    monkeypatch.setattr(hotspots, "fetch_all", fake_fetch_all)

    hotspots._load_alerts(OFFICER, statistical=True)
    hotspots._load_alerts(OFFICER, statistical=False)

    assert "a.source = %(warningSource)s" in calls[0][0]
    assert "a.source <> %(warningSource)s" in calls[1][0]
    assert all(call[1]["warningSource"] == warning_engine.WARNING_SOURCE for call in calls)


def test_duplicate_operational_alerts_keep_highest_risk_row() -> None:
    alerts = [
        {
            "id": "high",
            "stationId": "station-1",
            "zoneLabel": "Central Market",
            "crimeType": "Theft",
            "riskScore": 88,
        },
        {
            "id": "duplicate",
            "stationId": "station-1",
            "zoneLabel": " central market ",
            "crimeType": "THEFT",
            "riskScore": 62,
        },
        {
            "id": "different",
            "stationId": "station-2",
            "zoneLabel": "Central Market",
            "crimeType": "Theft",
            "riskScore": 55,
        },
    ]

    result = hotspots._dedupe_operational_alerts(alerts)

    assert [alert["id"] for alert in result] == ["high", "different"]
