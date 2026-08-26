from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.routers.ai import extract_case_sources
from app.services.ai_tools import filter_tools_for_role
from app.services.ai_tools import execute_tool
from app.services.case_access import load_officer_by_badge
from app.services.llm_gateway import CompletionEnvelope

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
        return CompletionEnvelope(
            content=CANNED_FINAL_RESPONSE if has_tool_result else CANNED_TOOL_CALL_RESPONSE,
            privacy={
                "processingMode": "SANITISED_EXTERNAL",
                "provider": "Test provider",
                "model": "test-model",
                "external": True,
                "retentionPolicy": "ZDR_REQUIRED",
                "redaction": {"applied": False, "total": 0, "categories": []},
                "durationMs": 1,
                "privacyProcessingMs": 0,
            },
        )

    try:
        with patch("app.routers.ai.create_audit_log", side_effect=fake_create_audit_log) as mock_audit, patch(
            "app.routers.ai.chat_completion_with_metadata", new=AsyncMock(side_effect=fake_chat_completion)
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
    # No FIR is surfaced unless a verified first-remand clock exists; the tool
    # must not fabricate an exposure from the FIR registration date.
    assert len(body["sources"]) <= 6
    assert body["privacy"]["processingMode"] == "SANITISED_EXTERNAL"

    # Audit must be written before the (mocked) LLM is ever called.
    assert mock_audit.call_count == 1
    assert "Which cases" not in (mock_audit.call_args.kwargs.get("details") or "")
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
    assert "get_crime_statistics" in names
    assert "update_match_status" not in names
    assert len(names) == 15


def test_ai_tool_surface_cannot_modify_match_status() -> None:
    result = asyncio.run(
        execute_tool(
            "update_match_status",
            {"matchId": "match-1", "status": "CONFIRMED"},
            {"id": "officer-1", "role": "INSPECTOR"},
        )
    )

    assert result == {"error": "Unknown tool: update_match_status"}


def test_case_sources_are_deduplicated_and_keep_navigable_ids() -> None:
    sources = extract_case_sources(
        {
            "results": [
                {"id": "case-1", "firNumber": "FIR/2026/0001"},
                {"caseId": "case-2", "firNumber": "FIR/2026/0002"},
                {"id": "case-1", "firNumber": "FIR/2026/0001"},
                {"id": "not-a-case", "firNumber": "unvalidated text"},
            ]
        }
    )

    assert sources == [
        {"id": "case-1", "firNumber": "FIR/2026/0001"},
        {"id": "case-2", "firNumber": "FIR/2026/0002"},
    ]
