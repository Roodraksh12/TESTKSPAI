from datetime import datetime, timedelta, timezone

from app.services.deadline_engine import compute_case_clocks, is_grave_offence

NOW = datetime(2026, 7, 19, tzinfo=timezone.utc)


def _case(days_ago: int, crime_type: str = "Theft", status: str = "OPEN", summary: str | None = None) -> dict:
    return {
        "crimeType": crime_type,
        "status": status,
        "summary": summary,
        "reportedDate": NOW - timedelta(days=days_ago),
    }


def test_theft_at_50_days_is_urgent_with_10_days_left() -> None:
    clocks = compute_case_clocks(_case(50), NOW)
    assert clocks["chargesheet"]["daysLeft"] == 10
    assert clocks["chargesheet"]["tier"] == "URGENT"
    assert clocks["tier"] == "URGENT"


def test_theft_at_61_days_is_overdue() -> None:
    clocks = compute_case_clocks(_case(61), NOW)
    assert clocks["chargesheet"]["tier"] == "OVERDUE"
    assert clocks["chargesheet"]["daysLeft"] < 0


def test_murder_at_61_days_is_watch_not_overdue() -> None:
    clocks = compute_case_clocks(_case(61, crime_type="Murder"), NOW)
    assert clocks["grave"] is True
    assert clocks["chargesheet"]["windowDays"] == 90
    assert clocks["chargesheet"]["daysLeft"] == 29
    assert clocks["chargesheet"]["tier"] == "WATCH"


def test_chargesheeted_case_at_200_days_is_compliant() -> None:
    clocks = compute_case_clocks(_case(200, status="CHARGESHEETED"), NOW)
    assert clocks["chargesheet"]["tier"] == "COMPLIANT"
    assert clocks["victim"]["tier"] == "COMPLIANT"
    assert clocks["tier"] == "COMPLIANT"


def test_closed_case_is_also_compliant() -> None:
    clocks = compute_case_clocks(_case(500, status="CLOSED"), NOW)
    assert clocks["tier"] == "COMPLIANT"


def test_victim_update_clock_at_80_days_has_10_days_left() -> None:
    clocks = compute_case_clocks(_case(80), NOW)
    assert clocks["victim"]["daysLeft"] == 10


def test_is_grave_offence_keyword_matching() -> None:
    assert is_grave_offence("Robbery") is True
    assert is_grave_offence("Theft", "the victim was kidnapped briefly") is True
    assert is_grave_offence("Theft", "simple pickpocketing") is False
    assert is_grave_offence("Cheating") is False


def test_headline_tier_is_worst_of_the_two_clocks() -> None:
    # At 65 days: chargesheet clock (60d window) is already OVERDUE, while
    # the victim-update clock (90d window) is only WATCH — headline must
    # report the worse of the two.
    clocks = compute_case_clocks(_case(65), NOW)
    assert clocks["chargesheet"]["tier"] == "OVERDUE"
    assert clocks["victim"]["tier"] == "WATCH"
    assert clocks["tier"] == "OVERDUE"


def test_on_track_case_within_window() -> None:
    clocks = compute_case_clocks(_case(5), NOW)
    assert clocks["chargesheet"]["tier"] == "ON_TRACK"


def test_accepts_iso_string_reported_date() -> None:
    case = {
        "crimeType": "Theft",
        "status": "OPEN",
        "summary": None,
        "reportedDate": (NOW - timedelta(days=61)).isoformat(),
    }
    clocks = compute_case_clocks(case, NOW)
    assert clocks["chargesheet"]["tier"] == "OVERDUE"
