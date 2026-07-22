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

    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
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
