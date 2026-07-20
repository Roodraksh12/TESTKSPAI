from app.main import app


def test_expected_routes_are_registered() -> None:
    paths = set(app.openapi()["paths"].keys())
    expected = {
        "/health",
        "/api/auth/login",
        "/api/auth/me",
        "/api/cases",
        "/api/cases/{case_id}",
        "/api/cases/{case_id}/intake",
        "/api/cases/{case_id}/draft",
        "/api/cases/{case_id}/matches",
        "/api/cases/{case_id}/chargesheet",
        "/api/search",
        "/api/dashboard",
        "/api/hotspots",
        "/api/analytics",
        "/api/settings/audit",
        "/api/chat",
        "/api/ai/draft-fir",
        "/api/ai/predict-steps",
        "/api/fir/upload",
        "/api/deadlines",
        "/api/network",
        "/api/audit",
    }
    assert expected.issubset(paths)
