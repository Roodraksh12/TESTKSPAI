"""Unit tests for jurisdiction SQL, capabilities, and invite geo rules."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.case_access import jurisdiction_filter_sql, require_case_write
from app.services.hierarchy import (
    platform_capabilities,
    required_geo_fields,
    scope_level_for,
)


def test_scope_levels() -> None:
    assert scope_level_for("POLICE_IT") == "STATE"
    assert scope_level_for("IGP") == "COMMAND_RANGE"
    assert scope_level_for("DIG") == "DISTRICTS"
    assert scope_level_for("SP") == "DISTRICT"
    assert scope_level_for("DYSP") == "SUBDIVISION"
    assert scope_level_for("INSPECTOR") == "STATION"


def test_required_geo_fields() -> None:
    assert required_geo_fields("IGP") == ["commandRangeId"]
    assert required_geo_fields("DIG") == ["districtIds"]
    assert required_geo_fields("SP") == ["districtId"]
    assert required_geo_fields("DYSP") == ["districtId", "rangeId"]
    assert required_geo_fields("SHO") == ["stationId"]
    assert required_geo_fields("DGP_IGP") == []


def test_jurisdiction_sql_station() -> None:
    sql, params = jurisdiction_filter_sql(
        {"role": "INSPECTOR", "stationId": "ps-1"},
        alias="c",
    )
    assert 'c."stationId"' in sql
    assert params["stationId"] == "ps-1"


def test_jurisdiction_sql_district() -> None:
    sql, params = jurisdiction_filter_sql(
        {"role": "SP", "districtId": "d-1"},
        alias="c",
    )
    assert "districtId" in sql
    assert params["jDistrictId"] == "d-1"


def test_jurisdiction_sql_state_empty() -> None:
    sql, params = jurisdiction_filter_sql({"role": "POLICE_IT"}, alias="c")
    assert sql == ""
    assert params == {}


def test_jurisdiction_sql_command_range() -> None:
    sql, params = jurisdiction_filter_sql(
        {"role": "IGP", "commandRangeId": "cmd-1"},
        alias="c",
    )
    assert "commandRangeId" in sql
    assert params["jCommandRangeId"] == "cmd-1"


def test_police_it_capabilities() -> None:
    caps = platform_capabilities({"role": "POLICE_IT"})
    assert caps["defaultHome"] == "/overview"
    assert caps["canWriteCases"] is False
    assert caps["nav"]["invite"] is True
    assert caps["nav"]["analytics"] is False
    assert caps["canUploadFir"] is False
    assert caps["nav"]["copilot"] is False
    assert caps["nav"]["firIntake"] is False
    assert caps["nav"]["administration"] is True
    assert caps["isPoliceIt"] is True


def test_sho_capabilities() -> None:
    caps = platform_capabilities({"role": "INSPECTOR"})
    assert caps["defaultHome"] == "/dashboard"
    assert caps["canWriteCases"] is True
    assert caps["nav"]["administration"] is True


def test_sp_capabilities() -> None:
    caps = platform_capabilities({"role": "SP"})
    assert caps["defaultHome"] == "/overview"
    assert caps["canWriteCases"] is True


def test_require_case_write_blocks_it() -> None:
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        require_case_write({"role": "POLICE_IT"})
    assert exc.value.status_code == 403


@pytest.fixture(scope="module")
def it_token(db_available: bool) -> str:
    if not db_available:
        pytest.skip("local Postgres not reachable")
    client = TestClient(app)
    response = client.post(
        "/api/auth/login",
        json={"badgeId": "KA-IT-0001", "password": "demo1234"},
    )
    if response.status_code != 200:
        pytest.skip("KA-IT-0001 not seeded")
    return response.json()["token"]


def test_police_it_login_capabilities(it_token: str) -> None:
    client = TestClient(app)
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {it_token}"})
    assert me.status_code == 200
    user = me.json()["user"]
    assert user["role"] == "POLICE_IT"
    assert user["capabilities"]["defaultHome"] == "/overview"
    assert user["capabilities"]["canWriteCases"] is False


def test_police_it_cannot_create_case(it_token: str) -> None:
    client = TestClient(app)
    response = client.post(
        "/api/cases",
        headers={"Authorization": f"Bearer {it_token}"},
        json={
            "firNumber": "FIR-IT-BLOCK-1",
            "crimeType": "Theft",
            "stationId": "station-whitefield",
            "summary": "should fail",
        },
    )
    assert response.status_code == 403


def test_admin_geo_routes_registered(it_token: str) -> None:
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {it_token}"}
    for path in (
        "/api/admin/command-ranges",
        "/api/admin/districts",
        "/api/admin/subdivisions",
        "/api/admin/stations",
    ):
        r = client.get(path, headers=headers)
        assert r.status_code == 200, path


def test_invite_sp_requires_district(it_token: str) -> None:
    client = TestClient(app)
    response = client.post(
        "/api/admin/invitations",
        headers={"Authorization": f"Bearer {it_token}"},
        json={
            "name": "Test SP",
            "badgeId": "KA-SP-TEST-GEO",
            "role": "SP",
            "email": "sp.test@example.com",
        },
    )
    assert response.status_code == 400
    assert "districtId" in response.json()["detail"].lower() or "Missing" in response.json()["detail"]


def test_invite_requires_email(it_token: str) -> None:
    client = TestClient(app)
    response = client.post(
        "/api/admin/invitations",
        headers={"Authorization": f"Bearer {it_token}"},
        json={
            "name": "Test SP",
            "badgeId": "KA-SP-NO-EMAIL",
            "role": "SP",
            "email": "",
            "districtId": "district-bengaluru-urban",
        },
    )
    assert response.status_code in (400, 422)
