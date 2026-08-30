from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers.cases import _decode_case_cursor, _encode_case_cursor


def test_case_cursor_round_trip() -> None:
    row = {
        "id": "case-123",
        "reportedDate": datetime(2026, 8, 24, 10, 30, tzinfo=timezone.utc),
    }

    reported_date, case_id = _decode_case_cursor(_encode_case_cursor(row))

    assert reported_date == row["reportedDate"]
    assert case_id == row["id"]


def test_invalid_case_cursor_is_rejected() -> None:
    with pytest.raises(HTTPException) as exc:
        _decode_case_cursor("not-a-valid-cursor")
    assert exc.value.status_code == 400


@pytest.fixture(scope="module")
def sp_headers(db_available: bool) -> dict[str, str]:
    if not db_available:
        pytest.skip("local Postgres not reachable")
    client = TestClient(app)
    login = client.post(
        "/api/auth/login",
        json={"badgeId": "KA-SP-9999", "password": "demo1234"},
    )
    assert login.status_code == 200
    return {"Authorization": f'Bearer {login.json()["token"]}'}


def test_case_directory_cursor_has_no_overlap(sp_headers: dict[str, str]) -> None:
    client = TestClient(app)
    first = client.get("/api/cases", params={"limit": 5}, headers=sp_headers)
    assert first.status_code == 200, first.text
    first_payload = first.json()
    assert len(first_payload["cases"]) == 5
    assert first_payload["hasMore"] is True
    assert first_payload["nextCursor"]

    second = client.get(
        "/api/cases",
        params={"limit": 5, "cursor": first_payload["nextCursor"]},
        headers=sp_headers,
    )
    assert second.status_code == 200, second.text
    first_ids = {row["id"] for row in first_payload["cases"]}
    second_ids = {row["id"] for row in second.json()["cases"]}
    assert first_ids.isdisjoint(second_ids)

    combined = first_payload["cases"] + second.json()["cases"]
    ordering = [(row["reportedDate"], row["id"]) for row in combined]
    assert ordering == sorted(ordering, reverse=True)


def test_case_directory_filters_come_from_scoped_records(sp_headers: dict[str, str]) -> None:
    payload = TestClient(app).get("/api/cases", headers=sp_headers).json()

    assert "Burglary" in payload["crimeTypes"]
    assert "Vehicle Theft" in payload["crimeTypes"]
    logical_stations = [
        (row.get("districtId"), row["name"].strip().casefold())
        for row in payload["stations"]
    ]
    assert len(logical_stations) == len(set(logical_stations))


def test_case_directory_searches_linked_people(sp_headers: dict[str, str]) -> None:
    response = TestClient(app).get(
        "/api/cases",
        params={"q": "Suresh"},
        headers=sp_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["cases"]
