from __future__ import annotations

import pytest

from app.services import analytics
from app.services.case_access import load_officer_by_badge


@pytest.fixture(scope="module")
def sp_officer(db_available: bool):
    if not db_available:
        pytest.skip("local Postgres not reachable")
    # Statewide scope so spike/hotspot fixtures remain visible after district RBAC.
    officer = load_officer_by_badge("KA-IT-0001") or load_officer_by_badge("KA-SP-9999")
    assert officer is not None
    return officer


def test_crime_trend_is_bucketed_and_non_empty(sp_officer) -> None:
    trend = analytics.get_crime_trend(sp_officer)
    assert len(trend["series"]) > 0
    assert len(trend["series"]) <= 4
    assert len(trend["data"]) == 6
    assert all("month" in row for row in trend["data"])


def test_velocity_fires_for_vehicle_theft_spike(sp_officer) -> None:
    velocity = analytics.compute_crime_velocity(sp_officer)
    vehicle_theft = next((v for v in velocity if v["crimeType"] == "Vehicle Theft"), None)
    assert vehicle_theft is not None
    assert vehicle_theft["recentCount"] >= 1
    assert vehicle_theft["risk"] >= 50


def test_hotspot_clusters_are_grid_bucketed(sp_officer) -> None:
    clusters = analytics.get_hotspot_clusters(sp_officer)
    assert len(clusters) > 0
    for cluster in clusters:
        assert cluster["intensity"] in ("high", "medium", "low")
        assert cluster["count"] >= 1


def test_early_warnings_include_a_deadline_breach(sp_officer) -> None:
    warnings = analytics.get_early_warnings(sp_officer)
    assert len(warnings) <= 6
    assert any(w["type"] == "DEADLINE" for w in warnings)
    probabilities = [w["probability"] for w in warnings]
    assert probabilities == sorted(probabilities, reverse=True)


def test_daily_case_volume_returns_requested_days(sp_officer) -> None:
    volume = analytics.get_daily_case_volume(sp_officer, days=7)
    assert len(volume) == 7
    assert all(v["count"] >= 0 for v in volume)
