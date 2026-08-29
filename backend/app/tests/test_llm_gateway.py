from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.services.llm_gateway import (
    OPENROUTER_CHAT_URL,
    _chat_completion_with_provider,
    chat_completion_with_metadata,
    resolve_provider_config,
)
from app.services.ai_privacy import PrivacyContext


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "AI_PROVIDER": "openrouter",
        "AI_REQUEST_TIMEOUT_SECONDS": 90,
        "OPENROUTER_API_KEY": "legacy-key",
        "OPENROUTER_MODEL": "legacy-model",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_openrouter_remains_the_default_and_uses_legacy_environment() -> None:
    provider = resolve_provider_config(make_settings())

    assert provider.name == "openrouter"
    assert provider.chat_url == OPENROUTER_CHAT_URL
    assert provider.model == "legacy-model"
    assert provider.api_key == "legacy-key"
    assert provider.private_endpoint is False
    assert provider.zdr_required is True


def test_openai_compatible_provider_requires_explicit_endpoint_and_model() -> None:
    provider = resolve_provider_config(
        make_settings(
            AI_PROVIDER="openai_compatible",
            AI_BASE_URL="http://private-ai.internal:8001/v1/",
            AI_MODEL="police-approved-model",
            AI_API_KEY="",
            AI_PRIVATE_ENDPOINT=True,
        )
    )

    assert provider.chat_url == "http://private-ai.internal:8001/v1/chat/completions"
    assert provider.model == "police-approved-model"
    assert provider.api_key == ""
    assert provider.private_endpoint is True


def test_full_chat_completions_url_is_not_duplicated() -> None:
    provider = resolve_provider_config(
        make_settings(
            AI_PROVIDER="openai_compatible",
            AI_BASE_URL="https://private.example/v1/chat/completions",
            AI_MODEL="approved-model",
        )
    )

    assert provider.chat_url == "https://private.example/v1/chat/completions"


def test_unknown_provider_is_rejected_before_any_network_call() -> None:
    with pytest.raises(HTTPException) as error:
        resolve_provider_config(make_settings(AI_PROVIDER="unapproved-cloud"))

    assert error.value.status_code == 503
    assert "Unsupported AI_PROVIDER" in error.value.detail


def test_openai_compatible_request_keeps_completion_and_tool_contract() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers.get("Authorization")
        captured["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "function": {
                                        "name": "search_cases",
                                        "arguments": "{}",
                                    },
                                }
                            ],
                        }
                    }
                ]
            },
        )

    provider = resolve_provider_config(
        make_settings(
            AI_PROVIDER="openai_compatible",
            AI_BASE_URL="https://private.example/v1",
            AI_MODEL="approved-model",
            AI_API_KEY="private-key",
        )
    )
    tools = [{"type": "function", "function": {"name": "search_cases"}}]
    result = asyncio.run(
        _chat_completion_with_provider(
            [{"role": "user", "content": "Find burglary cases"}],
            provider=provider,
            tools=tools,
            tool_choice="auto",
            transport=httpx.MockTransport(handler),
        )
    )

    assert captured["url"] == "https://private.example/v1/chat/completions"
    assert captured["authorization"] == "Bearer private-key"
    assert captured["payload"] == {
        "model": "approved-model",
        "messages": [{"role": "user", "content": "Find burglary cases"}],
        "tools": tools,
        "tool_choice": "auto",
    }
    assert isinstance(result, dict)
    assert result["tool_calls"][0]["function"]["name"] == "search_cases"


def test_openai_compatible_endpoint_can_omit_authorization_header() -> None:
    captured_headers: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured_headers.update(request.headers)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Answer"}}]},
        )

    provider = resolve_provider_config(
        make_settings(
            AI_PROVIDER="openai_compatible",
            AI_BASE_URL="http://127.0.0.1:9000/v1",
            AI_MODEL="local-model",
            AI_API_KEY="",
        )
    )
    result = asyncio.run(
        _chat_completion_with_provider(
            [{"role": "user", "content": "Hello"}],
            provider=provider,
            transport=httpx.MockTransport(handler),
        )
    )

    assert "authorization" not in captured_headers
    assert result == "Answer"


def test_provider_error_is_returned_as_a_safe_gateway_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "invalid key"}})

    provider = resolve_provider_config(make_settings())
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            _chat_completion_with_provider(
                [{"role": "user", "content": "Hello"}],
                provider=provider,
                transport=httpx.MockTransport(handler),
            )
        )

    assert error.value.status_code == 502
    assert error.value.detail == "OpenRouter 401 for model 'legacy-model': invalid key"


def test_openrouter_low_level_request_enforces_zero_data_retention() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "Answer"}}]})

    provider = resolve_provider_config(make_settings())
    result = asyncio.run(
        _chat_completion_with_provider(
            [{"role": "user", "content": "Sanitised question"}],
            provider=provider,
            transport=httpx.MockTransport(handler),
        )
    )

    assert result == "Answer"
    assert captured["payload"]["provider"] == {"zdr": True}


def test_openrouter_can_pause_zero_data_retention_for_synthetic_demo() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "Answer"}}]})

    provider = resolve_provider_config(
        make_settings(OPENROUTER_ZDR_REQUIRED=False)
    )
    result = asyncio.run(
        _chat_completion_with_provider(
            [{"role": "user", "content": "Synthetic demo question"}],
            provider=provider,
            transport=httpx.MockTransport(handler),
        )
    )

    assert result == "Answer"
    assert "provider" not in captured["payload"]


def test_paused_zdr_is_reported_in_privacy_metadata() -> None:
    async def fake_provider(messages, **kwargs):
        return "Answer"

    settings = make_settings(OPENROUTER_ZDR_REQUIRED=False)
    with patch("app.services.llm_gateway.get_settings", return_value=settings), patch(
        "app.services.llm_gateway._chat_completion_with_provider",
        new=AsyncMock(side_effect=fake_provider),
    ), patch("app.services.llm_gateway.ai_privacy_audit.begin_request", return_value=None):
        envelope = asyncio.run(
            chat_completion_with_metadata(
                [{"role": "user", "content": "Synthetic demo question"}],
                privacy_context=PrivacyContext(purpose="TEST"),
            )
        )

    assert envelope.privacy["retentionPolicy"] == "PROVIDER_DEFAULT"


def test_external_gateway_tokenises_request_and_restores_response() -> None:
    captured: dict[str, object] = {}

    async def fake_provider(messages, **kwargs):
        captured["messages"] = messages
        return {"content": "Result for [PERSON_1]", "tool_calls": []}

    settings = make_settings()
    with patch("app.services.llm_gateway.get_settings", return_value=settings), patch(
        "app.services.llm_gateway._chat_completion_with_provider",
        new=AsyncMock(side_effect=fake_provider),
    ), patch("app.services.llm_gateway.ai_privacy_audit.begin_request", return_value=None):
        envelope = asyncio.run(
            chat_completion_with_metadata(
                [{"role": "user", "content": "find Anitha B"}],
                tools=[{"type": "function", "function": {"name": "search_cases"}}],
                privacy_context=PrivacyContext(purpose="TEST"),
            )
        )

    outbound = json.dumps(captured["messages"])
    assert "Anitha B" not in outbound
    assert envelope.content["content"] == "Result for Anitha B"
    assert envelope.privacy["processingMode"] == "SANITISED_EXTERNAL"
    assert envelope.privacy["redaction"]["total"] >= 1
    assert envelope.privacy["privacyProcessingMs"] >= 0


def test_external_mode_disabled_fails_before_provider_call() -> None:
    settings = make_settings(AI_EXTERNAL_MODE="disabled")
    provider_call = AsyncMock()
    with patch("app.services.llm_gateway.get_settings", return_value=settings), patch(
        "app.services.llm_gateway._chat_completion_with_provider",
        new=provider_call,
    ):
        with pytest.raises(HTTPException) as error:
            asyncio.run(
                chat_completion_with_metadata(
                    [{"role": "user", "content": "Hello"}],
                    privacy_context=PrivacyContext(purpose="TEST"),
                )
            )

    assert error.value.status_code == 503
    provider_call.assert_not_awaited()


def test_unmarked_openai_compatible_endpoint_is_blocked() -> None:
    settings = make_settings(
        AI_PROVIDER="openai_compatible",
        AI_BASE_URL="https://unknown.example/v1",
        AI_MODEL="unknown-model",
        AI_PRIVATE_ENDPOINT=False,
    )
    with patch("app.services.llm_gateway.get_settings", return_value=settings):
        with pytest.raises(HTTPException) as error:
            asyncio.run(
                chat_completion_with_metadata(
                    [{"role": "user", "content": "Hello"}],
                    privacy_context=PrivacyContext(purpose="TEST"),
                )
            )

    assert error.value.status_code == 503
    assert "explicitly marked private" in error.value.detail


def test_egress_limit_blocks_oversized_external_context() -> None:
    settings = make_settings(AI_MAX_EGRESS_CHARACTERS=10)
    with patch("app.services.llm_gateway.get_settings", return_value=settings):
        with pytest.raises(HTTPException) as error:
            asyncio.run(
                chat_completion_with_metadata(
                    [{"role": "user", "content": "This is longer than ten characters"}],
                    privacy_context=PrivacyContext(purpose="TEST"),
                )
            )

    assert error.value.status_code == 413
