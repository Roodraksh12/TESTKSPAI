from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.services.ai_tools import filter_tools_for_role
from app.services.case_access import load_officer_by_badge

CANNED_TOOL_CALL_RESPONSE = {
    "content": None,
    "tool_calls": [
        {
            "id": "call_1",
            "function": {"name": "get_deadline_risks", "arguments": "{}"},
        }
    ],
}
CANNED_FINAL_RESPONSE = {
    "content": "Several cases are past the charge-sheet deadline — see FIR/2026/EXTRA-101.",
    "tool_calls": [],
}


def test_chat_returns_explainability_and_audits_before_llm_call(db_available: bool) -> None:
    if not db_available:
        pytest.skip("local Postgres not reachable")

    officer = load_officer_by_badge("KA-INS-4471")
    assert officer is not None

    app.dependency_overrides[get_current_user] = lambda: {"officer": officer, "token": {}}
    client = TestClient(app)

    call_order: list[str] = []

    def fake_create_audit_log(*args, **kwargs):
        call_order.append("audit")

    async def fake_chat_completion(messages, **kwargs):
        # First call gets tools -> returns a tool_call; second call (post tool
        # execution) gets no more tool_calls -> final answer.
        has_tool_result = any(m.get("role") == "tool" for m in messages)
        call_order.append("llm")
        return CANNED_FINAL_RESPONSE if has_tool_result else CANNED_TOOL_CALL_RESPONSE

    try:
        with patch("app.routers.ai.create_audit_log", side_effect=fake_create_audit_log) as mock_audit, patch(
            "app.routers.ai.chat_completion", new=AsyncMock(side_effect=fake_chat_completion)
        ):
            response = client.post(
                "/api/chat",
                json={"message": "Which cases risk default bail this month?", "history": []},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    body = response.json()

    assert body["toolsUsed"] == ["get_deadline_risks"]
    assert any(source.startswith("FIR/") for source in body["sources"])
    assert len(body["sources"]) <= 6

    # Audit must be written before the (mocked) LLM is ever called.
    assert mock_audit.call_count == 1
    assert call_order[0] == "audit"
    assert "llm" in call_order[1:]


def test_constable_role_gating_strips_hotspot_and_person_tools() -> None:
    tools = filter_tools_for_role("CONSTABLE")
    names = {t["function"]["name"] for t in tools}
    assert "get_hotspot_summary" not in names
    assert "get_person_connections" not in names
    assert "get_deadline_risks" in names


def test_sp_role_keeps_all_tools() -> None:
    tools = filter_tools_for_role("SP")
    names = {t["function"]["name"] for t in tools}
    assert "get_hotspot_summary" in names
    assert "get_person_connections" in names
    assert len(names) == 15
