from datetime import datetime, timedelta, timezone

from app.services.deadline_engine import compute_case_clocks, compute_custody_clock, is_grave_offence

NOW = datetime(2026, 7, 19, tzinfo=timezone.utc)


def _case(days_ago: int = 5, crime_type: str = "Theft", status: str = "OPEN", summary: str | None = None) -> dict:
    return {
        "crimeType": crime_type,
        "status": status,
        "summary": summary,
        "reportedDate": NOW - timedelta(days=days_ago),
    }


def _custody(days_ago: int, window_days: int = 60) -> dict:
    return {
        "id": "clock-1",
        "casePersonId": "cp-1",
        "personName": "Test accused",
        "firstRemandAt": NOW - timedelta(days=days_ago),
        "windowDays": window_days,
        "thresholdBasis": "DEATH_LIFE_OR_TEN_YEARS_OR_MORE" if window_days == 90 else "OTHER_OFFENCE",
        "legalSectionDetails": "Test section",
        "remandOrderReference": "RM-1",
    }


def test_60_day_clock_at_50_remand_days_is_urgent_with_10_days_left() -> None:
    clocks = compute_case_clocks(_case(), NOW, [_custody(50)])
    assert clocks["chargesheet"]["daysLeft"] == 10
    assert clocks["chargesheet"]["tier"] == "URGENT"
    assert clocks["tier"] == "URGENT"


def test_60_day_clock_on_61st_calendar_day_is_overdue() -> None:
    clocks = compute_case_clocks(_case(), NOW, [_custody(61)])
    assert clocks["chargesheet"]["tier"] == "OVERDUE"
    assert clocks["chargesheet"]["daysLeft"] < 0


def test_90_day_window_comes_from_recorded_statutory_basis_not_crime_label() -> None:
    clocks = compute_case_clocks(_case(crime_type="Theft"), NOW, [_custody(61, window_days=90)])
    assert clocks["grave"] is True
    assert clocks["chargesheet"]["windowDays"] == 90
    assert clocks["chargesheet"]["daysLeft"] == 29
    assert clocks["chargesheet"]["tier"] == "WATCH"


def test_completed_case_without_a_remand_record_is_legacy_compliant_not_a_guessed_clock() -> None:
    clocks = compute_case_clocks(_case(status="CHARGESHEETED"), NOW)
    assert clocks["chargesheet"] is None
    assert clocks["chargesheetStatus"] == "LEGACY_CASE_COMPLETED"
    assert clocks["tier"] == "COMPLIANT"


def test_open_case_without_a_remand_record_does_not_create_a_false_default_bail_risk() -> None:
    clocks = compute_case_clocks(_case(days_ago=200), NOW)
    assert clocks["chargesheet"] is None
    assert clocks["chargesheetStatus"] == "NO_REMAND_RECORDED"
    assert clocks["tier"] == "NOT_STARTED"


def test_victim_update_clock_at_80_days_has_10_days_left() -> None:
    clocks = compute_case_clocks(_case(days_ago=80), NOW)
    assert clocks["victim"]["daysLeft"] == 10


def test_is_grave_offence_keyword_matching_is_not_used_for_the_statutory_window() -> None:
    assert is_grave_offence("Robbery") is True
    assert is_grave_offence("Theft", "the victim was kidnapped briefly") is True
    assert is_grave_offence("Theft", "simple pickpocketing") is False
    assert is_grave_offence("Cheating") is False


def test_worst_case_tier_uses_the_most_at_risk_accused_clock() -> None:
    clocks = compute_case_clocks(_case(), NOW, [_custody(10), _custody(65)])
    assert clocks["chargesheet"]["tier"] == "OVERDUE"
    assert clocks["tier"] == "OVERDUE"


def test_filing_on_or_before_the_completion_date_is_recorded_in_time() -> None:
    clock = _custody(61)
    clock["reportFiledAt"] = NOW - timedelta(days=2)
    clock["reportReference"] = "FR-1"
    result = compute_custody_clock(clock, NOW)
    assert result["filingStatus"] == "FILED_IN_TIME"
    assert result["tier"] == "COMPLIANT"


def test_first_remand_day_is_counted_as_day_one() -> None:
    # Remand on 14 May IST: 12 July is day 60 and the default-bail risk date
    # begins at midnight on 13 July IST.
    remand = datetime(2026, 5, 13, 18, 30, tzinfo=timezone.utc)  # 14 May 00:00 IST
    result = compute_custody_clock({**_custody(1), "firstRemandAt": remand}, datetime(2026, 7, 12, 18, 29, tzinfo=timezone.utc))
    assert result["completionDate"] == "2026-07-12"
    assert result["tier"] == "URGENT"
    result_at_risk = compute_custody_clock({**_custody(1), "firstRemandAt": remand}, datetime(2026, 7, 12, 18, 30, tzinfo=timezone.utc))
    assert result_at_risk["tier"] == "OVERDUE"
