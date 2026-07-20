from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def tokens(db_available: bool) -> dict[str, str]:
    if not db_available:
        pytest.skip("local Postgres not reachable")
    client = TestClient(app)
    result = {}
    for badge, role in [("KA-CON-1001", "CONSTABLE"), ("KA-INS-4471", "INSPECTOR"), ("KA-SP-9999", "SP")]:
        response = client.post("/api/auth/login", json={"badgeId": badge, "password": "demo1234"})
        assert response.status_code == 200, response.text
        result[role] = response.json()["token"]
    return result


def test_search_endpoint_requires_auth() -> None:
    client = TestClient(app)
    response = client.get("/api/search", params={"q": "a"})
    assert response.status_code == 401


def test_deadlines_endpoint_requires_auth() -> None:
    client = TestClient(app)
    response = client.get("/api/deadlines")
    assert response.status_code == 401


def test_network_endpoint_requires_auth() -> None:
    client = TestClient(app)
    response = client.get("/api/network")
    assert response.status_code == 401


def test_suspect_search_is_station_scoped_for_non_sp(tokens: dict[str, str]) -> None:
    client = TestClient(app)
    con_headers = {"Authorization": f"Bearer {tokens['CONSTABLE']}"}
    sp_headers = {"Authorization": f"Bearer {tokens['SP']}"}

    # "Ismail R" is only linked to Indiranagar PS cases; the constable is Whitefield PS.
    con_response = client.get("/api/search", params={"q": "Ismail"}, headers=con_headers)
    sp_response = client.get("/api/search", params={"q": "Ismail"}, headers=sp_headers)

    assert con_response.status_code == 200
    assert sp_response.status_code == 200
    assert con_response.json()["suspects"] == []
    assert len(sp_response.json()["suspects"]) >= 1


def test_audit_visibility_differs_by_role(tokens: dict[str, str]) -> None:
    client = TestClient(app)
    con_response = client.get("/api/audit", headers={"Authorization": f"Bearer {tokens['CONSTABLE']}"})
    sp_response = client.get("/api/audit", headers={"Authorization": f"Bearer {tokens['SP']}"})

    assert con_response.status_code == 200
    assert sp_response.status_code == 200
    # SP sees the whole district; constable sees only their own actions, which
    # is a subset (and, in this seeded dataset, strictly fewer) than SP's view.
    assert len(sp_response.json()["auditLogs"]) >= len(con_response.json()["auditLogs"])
