from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services import crime_queries


STATION_OFFICER = {
    "id": "officer-1",
    "role": "INSPECTOR",
    "stationId": "station-1",
}


def test_this_month_uses_karnataka_calendar_boundaries() -> None:
    now = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)
    start, end, applied = crime_queries.resolve_incident_window(
        {"timeframe": "this_month"},
        now=now,
    )

    assert start == datetime(2026, 7, 31, 18, 30, tzinfo=timezone.utc)
    assert end == now
    assert applied == {"timeframe": "this_month"}


def test_explicit_end_date_is_inclusive_in_karnataka_time() -> None:
    start, end, applied = crime_queries.resolve_incident_window(
        {"dateFrom": "2026-08-23", "dateTo": "2026-08-24"}
    )

    assert start == datetime(2026, 8, 22, 18, 30, tzinfo=timezone.utc)
    assert end == datetime(2026, 8, 24, 18, 30, tzinfo=timezone.utc)
    assert applied == {
        "timeframe": "all_time",
        "dateFrom": "2026-08-23",
        "dateTo": "2026-08-24",
    }


def test_relative_timeframe_and_explicit_dates_cannot_be_mixed() -> None:
    with pytest.raises(crime_queries.QueryValidationError) as error:
        crime_queries.resolve_incident_window(
            {"timeframe": "last_7_days", "dateFrom": "2026-08-01"}
        )

    assert str(error.value) == "Use either timeframe or dateFrom/dateTo, not both"


def test_search_cases_applies_verified_filters_scope_and_result_cap(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    def fake_fetch_all(sql: str, params: dict) -> list[dict]:
        captured["sql"] = sql
        captured["params"] = params
        return [{"id": "case-1", "firNumber": "FIR/2026/0001"}]

    monkeypatch.setattr(crime_queries, "fetch_all", fake_fetch_all)
    result = crime_queries.search_cases(
        {
            "crimeType": "Burglary",
            "status": "open",
            "districtName": "Bengaluru East",
            "personName": "Anita",
            "personRole": "accused",
            "dateFrom": "2026-08-01",
            "dateTo": "2026-08-24",
            "take": 100,
        },
        STATION_OFFICER,
    )

    assert result == [{"id": "case-1", "firNumber": "FIR/2026/0001"}]
    assert 'c."stationId" = %(stationId)s' in captured["sql"]
    assert 'JOIN "Person" pp' in captured["sql"]
    assert captured["params"]["crimeType"] == "%Burglary%"
    assert captured["params"]["status"] == "OPEN"
    assert captured["params"]["districtName"] == "%Bengaluru East%"
    assert captured["params"]["personName"] == "%Anita%"
    assert captured["params"]["personRole"] == "ACCUSED"
    assert captured["params"]["stationId"] == "station-1"
    assert captured["params"]["take"] == crime_queries.MAX_CASE_RESULTS


def test_invalid_search_filter_does_not_query_the_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_fetch(*_args, **_kwargs):
        raise AssertionError("database should not be queried")

    monkeypatch.setattr(crime_queries, "fetch_all", fail_fetch)
    result = crime_queries.search_cases({"status": "MISSING"}, STATION_OFFICER)

    assert isinstance(result, dict)
    assert "status must be one of" in result["error"]


def test_crime_statistics_returns_database_total_not_visible_row_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    def fake_fetch_all(sql: str, params: dict) -> list[dict]:
        captured["sql"] = sql
        captured["params"] = params
        return [
            {"label": "Burglary", "caseCount": 6, "totalCases": 8, "percentage": 75.0},
            {"label": "Theft", "caseCount": 2, "totalCases": 8, "percentage": 25.0},
        ]

    monkeypatch.setattr(crime_queries, "fetch_all", fake_fetch_all)
    result = crime_queries.get_crime_statistics(
        {"groupBy": "crime_type", "timeframe": "last_30_days"},
        STATION_OFFICER,
    )

    assert result["totalCases"] == 8
    assert result["breakdown"] == [
        {"label": "Burglary", "caseCount": 6, "percentage": 75.0},
        {"label": "Theft", "caseCount": 2, "percentage": 25.0},
    ]
    assert result["filters"] == {"timeframe": "last_30_days"}
    assert result["truncated"] is False
    assert 'c."stationId" = %(stationId)s' in captured["sql"]
    assert "SUM(COUNT(*)) OVER ()" in captured["sql"]


def test_statistics_grouping_is_allowlisted_before_sql_generation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_fetch(*_args, **_kwargs):
        raise AssertionError("database should not be queried")

    monkeypatch.setattr(crime_queries, "fetch_all", fail_fetch)
    result = crime_queries.get_crime_statistics(
        {"groupBy": 'crime_type; DROP TABLE "Case"'},
        STATION_OFFICER,
    )

    assert "groupBy must be one of" in result["error"]
