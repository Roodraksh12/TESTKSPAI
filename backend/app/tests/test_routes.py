from app.main import app
from app.services.hierarchy import can_invite_rank


def test_expected_routes_are_registered() -> None:
    paths = set(app.openapi()["paths"].keys())
    expected = {
        "/health",
        "/api/auth/login",
        "/api/auth/me",
        "/api/auth/change-password",
        "/api/auth/forgot-password",
        "/api/admin/invitations",
        "/api/admin/subtree",
        "/api/admin/stations",
        "/api/admin/password-resets",
        "/api/admin/password-resets/{request_id}/fulfill",
        "/api/cases",
        "/api/cases/{case_id}",
        "/api/cases/{case_id}/intake",
        "/api/cases/{case_id}/draft",
        "/api/cases/{case_id}/matches",
        "/api/cases/{case_id}/chargesheet",
        "/api/cases/{case_id}/final-report",
        "/api/cases/{case_id}/final-report/initialize",
        "/api/cases/{case_id}/final-report/submit-review",
        "/api/cases/{case_id}/final-report/return",
        "/api/cases/{case_id}/final-report/approve",
        "/api/cases/{case_id}/final-report/versions",
        "/api/cases/{case_id}/final-report/pdf",
        "/api/cases/{case_id}/final-report/refresh-sources",
        "/api/cases/{case_id}/report-sources",
        "/api/cases/{case_id}/investigation-plan",
        "/api/cases/{case_id}/investigation-plan/initialize",
        "/api/cases/{case_id}/investigation-plan/tasks/{task_id}",
        "/api/cases/{case_id}/investigation-plan/documents",
        "/api/cases/{case_id}/investigation-plan/documents/{document_id}",
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


def test_invite_rank_rules_match_plan() -> None:
    assert can_invite_rank("ASP_ACP", "DYSP")
    assert not can_invite_rank("ASP_ACP", "SHO")
