"""Backward-compatible AI service imports.

Existing routers import this module, so it remains as a stable public surface
while the implementation can use either OpenRouter or an explicitly configured
OpenAI-compatible endpoint.
"""

from app.services.llm_gateway import (
    OPENROUTER_CHAT_URL,
    chat_completion,
    chat_completion_with_metadata,
    chat_json,
    provider_error_detail,
)

OPENROUTER_URL = OPENROUTER_CHAT_URL
_openrouter_error_detail = provider_error_detail

__all__ = [
    "OPENROUTER_URL",
    "chat_completion",
    "chat_completion_with_metadata",
    "chat_json",
]
