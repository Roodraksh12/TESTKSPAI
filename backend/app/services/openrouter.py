from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import HTTPException

from app.config import get_settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


async def chat_completion(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float | None = None,
    response_format: dict[str, str] | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
) -> str | dict[str, Any]:
    settings = get_settings()
    payload: dict[str, Any] = {
        "model": model or settings.openrouter_model,
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

    if not settings.openrouter_api_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY is not configured")
    if not payload["model"]:
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_MODEL is not configured (e.g. openrouter/free)",
        )

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.RequestError as exc:
        # Unhandled transport errors become opaque "Failed to fetch" in the browser
        # because the 500 path often drops CORS headers.
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach OpenRouter: {exc.__class__.__name__}",
        ) from exc

    if response.status_code >= 400:
        reason = _openrouter_error_detail(response)
        raise HTTPException(
            status_code=502,
            detail=(
                f"OpenRouter {response.status_code} for model "
                f"'{payload['model']}': {reason}"
            ),
        )

    data = response.json()

    # OpenRouter answers 200 even when the upstream provider refused — a
    # rate-limited or tool-incapable free model comes back with an "error"
    # object and no "choices". Reading choices blindly raised KeyError,
    # which escaped as an unhandled 500 with no CORS headers and reached the
    # browser as an opaque "failed to fetch". Surface the real reason.
    choices = data.get("choices")
    if not choices:
        provider_error = data.get("error") or {}
        reason = provider_error.get("message") or "no completion returned"
        raise HTTPException(
            status_code=502,
            detail=f"Model '{payload['model']}' did not answer: {reason}",
        )

    message = choices[0].get("message") or {}
    if tools is not None:
        return message
    return message.get("content") or ""


def _openrouter_error_detail(response: httpx.Response) -> str:
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
) -> dict[str, Any]:
    content = await chat_completion(
        messages,
        model=model,
        temperature=temperature,
        response_format={"type": "json_object"},
    )
    if isinstance(content, dict):
        raw = content.get("content") or "{}"
    else:
        raw = content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}
