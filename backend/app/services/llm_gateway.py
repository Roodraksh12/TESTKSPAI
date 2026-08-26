from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException

from app.config import Settings, get_settings
from app.services import ai_privacy_audit
from app.services.ai_privacy import (
    PrivacyContext,
    PrivacySanitizer,
    count_egress_characters,
)

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
SUPPORTED_AI_PROVIDERS = {"openrouter", "openai_compatible"}


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    display_name: str
    chat_url: str
    model: str
    api_key: str
    timeout_seconds: float
    private_endpoint: bool
    zdr_required: bool


@dataclass(frozen=True)
class CompletionEnvelope:
    content: str | dict[str, Any]
    privacy: dict[str, Any]


def resolve_provider_config(
    settings: Settings,
    *,
    model_override: str | None = None,
) -> ProviderConfig:
    """Resolve the configured backend without changing the completion contract."""

    provider = (settings.ai_provider or "openrouter").strip().lower()
    timeout = settings.ai_request_timeout_seconds
    if timeout <= 0:
        raise HTTPException(
            status_code=503,
            detail="AI_REQUEST_TIMEOUT_SECONDS must be greater than zero",
        )

    if provider == "openrouter":
        api_key = settings.openrouter_api_key.strip()
        model = (model_override or settings.openrouter_model).strip()
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="OPENROUTER_API_KEY is not configured",
            )
        if not model:
            raise HTTPException(
                status_code=503,
                detail="OPENROUTER_MODEL is not configured (e.g. openrouter/free)",
            )
        return ProviderConfig(
            name=provider,
            display_name="OpenRouter",
            chat_url=OPENROUTER_CHAT_URL,
            model=model,
            api_key=api_key,
            timeout_seconds=timeout,
            private_endpoint=False,
            zdr_required=True,
        )

    if provider == "openai_compatible":
        base_url = settings.ai_base_url.strip()
        model = (model_override or settings.ai_model).strip()
        if not base_url:
            raise HTTPException(
                status_code=503,
                detail="AI_BASE_URL is required when AI_PROVIDER=openai_compatible",
            )
        if not model:
            raise HTTPException(
                status_code=503,
                detail="AI_MODEL is required when AI_PROVIDER=openai_compatible",
            )
        return ProviderConfig(
            name=provider,
            display_name="AI provider",
            chat_url=_normalise_chat_url(base_url),
            model=model,
            # Local endpoints commonly do not require authentication. If a key
            # is configured, the standard Bearer header is sent.
            api_key=settings.ai_api_key.strip(),
            timeout_seconds=timeout,
            private_endpoint=settings.ai_private_endpoint,
            zdr_required=False,
        )

    supported = ", ".join(sorted(SUPPORTED_AI_PROVIDERS))
    raise HTTPException(
        status_code=503,
        detail=f"Unsupported AI_PROVIDER '{provider}'. Supported values: {supported}",
    )


def _normalise_chat_url(base_url: str) -> str:
    url = base_url.rstrip("/")
    if url.endswith("/chat/completions"):
        return url
    return f"{url}/chat/completions"


async def chat_completion(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float | None = None,
    response_format: dict[str, str] | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
    privacy_context: PrivacyContext | None = None,
) -> str | dict[str, Any]:
    envelope = await chat_completion_with_metadata(
        messages,
        model=model,
        temperature=temperature,
        response_format=response_format,
        tools=tools,
        tool_choice=tool_choice,
        privacy_context=privacy_context,
    )
    return envelope.content


async def chat_completion_with_metadata(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float | None = None,
    response_format: dict[str, str] | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
    privacy_context: PrivacyContext | None = None,
) -> CompletionEnvelope:
    settings = get_settings()
    provider = resolve_provider_config(settings, model_override=model)
    external = not provider.private_endpoint
    processing_mode = "SANITISED_EXTERNAL" if external else "PRIVATE_MODEL"

    if external and settings.ai_external_mode.strip().lower() != "redacted_only":
        raise HTTPException(
            status_code=503,
            detail="External AI is disabled by the backend privacy policy",
        )
    if external and provider.name != "openrouter":
        raise HTTPException(
            status_code=503,
            detail=(
                "An OpenAI-compatible endpoint must be explicitly marked private "
                "with AI_PRIVATE_ENDPOINT=true before case data can be sent to it"
            ),
        )

    privacy_started = time.perf_counter()
    sanitizer = PrivacySanitizer(
        privacy_context.known_sensitive_values if privacy_context else None
    )
    outbound_messages = sanitizer.sanitize_messages(messages) if external else messages
    privacy_processing_ms = round((time.perf_counter() - privacy_started) * 1000)
    egress_characters = count_egress_characters(outbound_messages)
    if settings.ai_max_egress_characters <= 0:
        raise HTTPException(
            status_code=503,
            detail="AI_MAX_EGRESS_CHARACTERS must be greater than zero",
        )
    if egress_characters > settings.ai_max_egress_characters:
        raise HTTPException(
            status_code=413,
            detail=(
                "The AI request is too large for external processing. Use an approved "
                "private endpoint or reduce the selected context."
            ),
        )

    redaction_counts = dict(sanitizer.counts) if external else {}
    audit_id = ai_privacy_audit.begin_request(
        context=privacy_context,
        provider=provider.display_name,
        model=provider.model,
        processing_mode=processing_mode,
        external=external,
        zdr_enforced=bool(external and provider.zdr_required),
        redaction_counts=redaction_counts,
        egress_characters=egress_characters,
        raw_request=messages,
    )
    provider_started = time.perf_counter()
    try:
        raw_result = await _chat_completion_with_provider(
            outbound_messages,
            provider=provider,
            temperature=temperature,
            response_format=response_format,
            tools=tools,
            tool_choice=tool_choice,
        )
    except Exception as exc:
        duration_ms = round((time.perf_counter() - provider_started) * 1000)
        ai_privacy_audit.finish_request(
            audit_id,
            status="FAILED",
            duration_ms=duration_ms,
            error_code=exc.__class__.__name__,
        )
        raise

    duration_ms = round((time.perf_counter() - provider_started) * 1000)
    restored_result = sanitizer.restore(raw_result) if external else raw_result
    ai_privacy_audit.finish_request(
        audit_id,
        status="SUCCEEDED",
        duration_ms=duration_ms,
        raw_response=raw_result,
    )
    return CompletionEnvelope(
        content=restored_result,
        privacy={
            "processingMode": processing_mode,
            "provider": provider.display_name,
            "model": provider.model,
            "external": external,
            "retentionPolicy": "ZDR_REQUIRED" if external else "PRIVATE_BOUNDARY",
            "redaction": {
                "applied": bool(redaction_counts),
                "total": sum(redaction_counts.values()),
                "categories": [
                    {"category": category, "count": count}
                    for category, count in sorted(redaction_counts.items())
                ],
            },
            "egressCharacters": egress_characters,
            "durationMs": duration_ms,
            "privacyProcessingMs": privacy_processing_ms,
        },
    )


async def _chat_completion_with_provider(
    messages: list[dict[str, Any]],
    *,
    provider: ProviderConfig,
    temperature: float | None = None,
    response_format: dict[str, str] | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> str | dict[str, Any]:
    payload: dict[str, Any] = {
        "model": provider.model,
        "messages": messages,
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if response_format is not None:
        payload["response_format"] = response_format
    if tools is not None:
        payload["tools"] = tools
    if tool_choice is not None:
        payload["tool_choice"] = tool_choice
    if provider.zdr_required:
        payload["provider"] = {"zdr": True}

    headers = {"Content-Type": "application/json"}
    if provider.api_key:
        headers["Authorization"] = f"Bearer {provider.api_key}"

    try:
        async with httpx.AsyncClient(
            timeout=provider.timeout_seconds,
            transport=transport,
        ) as client:
            response = await client.post(
                provider.chat_url,
                headers=headers,
                json=payload,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach {provider.display_name}: {exc.__class__.__name__}",
        ) from exc

    if response.status_code >= 400:
        reason = provider_error_detail(response)
        raise HTTPException(
            status_code=502,
            detail=(
                f"{provider.display_name} {response.status_code} for model "
                f"'{provider.model}': {reason}"
            ),
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"{provider.display_name} returned an invalid JSON response",
        ) from exc

    choices = data.get("choices") if isinstance(data, dict) else None
    if not choices:
        provider_error = data.get("error") if isinstance(data, dict) else None
        provider_error = provider_error if isinstance(provider_error, dict) else {}
        reason = provider_error.get("message") or "no completion returned"
        raise HTTPException(
            status_code=502,
            detail=f"Model '{provider.model}' did not answer: {reason}",
        )

    message = choices[0].get("message") or {}
    if tools is not None:
        return message
    return message.get("content") or ""


def provider_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        text = (response.text or "").strip()
        return text[:300] or response.reason_phrase or "unknown error"
    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
        if isinstance(err, str):
            return err
        if payload.get("message"):
            return str(payload["message"])
    return str(payload)[:300]


async def chat_json(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float | None = None,
    privacy_context: PrivacyContext | None = None,
) -> dict[str, Any]:
    content = await chat_completion(
        messages,
        model=model,
        temperature=temperature,
        response_format={"type": "json_object"},
        privacy_context=privacy_context,
    )
    if isinstance(content, dict):
        raw = content.get("content") or "{}"
    else:
        raw = content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}
