from __future__ import annotations

from app.services import network_builder


def _case(case_id: str, reported: str) -> dict:
    return {
        "id": case_id,
        "firNumber": f"FIR/2026/{case_id}",
        "crimeType": "Burglary",
        "incidentDate": reported,
        "reportedDate": reported,
        "summary": "",
        "rawExtractedText": "",
        "stationId": "station-1",
        "stationName": "Test Station",
    }


def test_seeded_loader_starts_with_requested_case_before_expanding(monkeypatch) -> None:
    requested = _case("old-case", "2025-01-01T00:00:00Z")
    neighbour = _case("linked-case", "2026-01-01T00:00:00Z")
    calls: list[dict] = []

    def fake_fetch_all(_sql: str, params: dict) -> list[dict]:
        calls.append(params)
        if params.get("seedCaseId") == requested["id"]:
            return [requested]
        if params.get("frontierCaseIds") == [requested["id"]]:
            return [neighbour]
        return []

    monkeypatch.setattr(network_builder, "fetch_all", fake_fetch_all)

    cases, capped, found = network_builder._load_seeded_cases(
        " AND c.\"stationId\" = %(stationId)s",
        {"stationId": "station-1"},
        requested["id"],
        hops=2,
    )

    assert found is True
    assert capped is False
    assert [case["id"] for case in cases] == ["old-case", "linked-case"]
    assert calls[0]["seedCaseId"] == "old-case"
    assert calls[0]["stationId"] == "station-1"


def test_seeded_loader_reports_inaccessible_case_without_recent_fallback(monkeypatch) -> None:
    monkeypatch.setattr(network_builder, "fetch_all", lambda _sql, _params: [])

    graph = network_builder.build_crime_network(
        {"role": "CONSTABLE", "stationId": "station-1"},
        seed_id="case:not-in-scope",
    )

    assert graph["nodes"] == []
    assert graph["meta"]["focused"] is True
    assert graph["meta"]["seedFound"] is False
    assert graph["meta"]["seedId"] == "case:not-in-scope"


def test_seeded_loader_caps_large_neighbourhood(monkeypatch) -> None:
    requested = _case("seed", "2025-01-01T00:00:00Z")
    neighbours = [
        _case(f"linked-{index}", "2026-01-01T00:00:00Z")
        for index in range(network_builder.GRAPH_CASE_CAP)
    ]

    def fake_fetch_all(_sql: str, params: dict) -> list[dict]:
        if params.get("seedCaseId") == requested["id"]:
            return [requested]
        if params.get("frontierCaseIds") == [requested["id"]]:
            return neighbours
        return []

    monkeypatch.setattr(network_builder, "fetch_all", fake_fetch_all)

    cases, capped, found = network_builder._load_seeded_cases(
        "",
        {},
        requested["id"],
        hops=2,
    )

    assert found is True
    assert capped is True
    assert len(cases) == network_builder.GRAPH_CASE_CAP

