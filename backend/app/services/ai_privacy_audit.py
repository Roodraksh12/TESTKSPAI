"""Privacy-safe request audit records for LLM egress.

Only metadata and keyed fingerprints are persisted. Raw prompts, completions and
the temporary token map are intentionally never accepted by the SQL helpers.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.config import get_settings
from app.services.ai_privacy import PrivacyContext
from app.services.db import execute, execute_returning, new_id

logger = logging.getLogger(__name__)


class PrivacyAuditUnavailable(RuntimeError):
    pass


def content_fingerprint(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    settings = get_settings()
    secret = settings.supabase_jwt_secret.strip()
    if not secret:
        raise PrivacyAuditUnavailable("JWT secret is unavailable for keyed AI audit fingerprints")
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def begin_request(
    *,
    context: PrivacyContext | None,
    provider: str,
    model: str,
    processing_mode: str,
    external: bool,
    zdr_enforced: bool,
    redaction_counts: dict[str, int],
    egress_characters: int,
    raw_request: Any,
) -> str | None:
    if not context or not context.officer_id:
        return None
    audit_id = new_id()
    try:
        row = execute_returning(
            '''
            INSERT INTO "AiRequestAudit" (
                id, "officerId", "sessionId", purpose, provider, model,
                "processingMode", external, "zdrEnforced", "redactionApplied",
                "redactionCounts", "egressCharacters", "caseIds", "toolNames",
                "requestFingerprint", status, "createdAt"
            ) VALUES (
                %(id)s, %(officerId)s, %(sessionId)s, %(purpose)s, %(provider)s,
                %(model)s, %(processingMode)s, %(external)s, %(zdrEnforced)s,
                %(redactionApplied)s, %(redactionCounts)s::jsonb,
                %(egressCharacters)s, %(caseIds)s, %(toolNames)s,
                %(requestFingerprint)s, 'STARTED', %(createdAt)s
            )
            RETURNING id
            ''',
            {
                "id": audit_id,
                "officerId": context.officer_id,
                "sessionId": context.session_id,
                "purpose": context.purpose,
                "provider": provider,
                "model": model,
                "processingMode": processing_mode,
                "external": external,
                "zdrEnforced": zdr_enforced,
                "redactionApplied": bool(redaction_counts),
                "redactionCounts": json.dumps(redaction_counts, sort_keys=True),
                "egressCharacters": max(0, int(egress_characters)),
                "caseIds": list(dict.fromkeys(context.case_ids)),
                "toolNames": list(dict.fromkeys(context.tool_names)),
                "requestFingerprint": content_fingerprint(raw_request),
                "createdAt": datetime.now(timezone.utc).replace(tzinfo=None),
            },
        )
        return row["id"] if row else None
    except Exception as exc:  # database compatibility during rolling migration
        logger.warning("AI privacy audit start failed: %s", exc.__class__.__name__)
        if get_settings().ai_privacy_audit_required:
            raise PrivacyAuditUnavailable("AI privacy audit storage is required but unavailable") from exc
        return None


def finish_request(
    audit_id: str | None,
    *,
    status: str,
    duration_ms: int,
    raw_response: Any | None = None,
    error_code: str | None = None,
) -> None:
    if not audit_id:
        return
    try:
        execute(
            '''
            UPDATE "AiRequestAudit"
            SET status = %(status)s,
                "responseFingerprint" = %(responseFingerprint)s,
                "errorCode" = %(errorCode)s,
                "durationMs" = %(durationMs)s,
                "completedAt" = %(completedAt)s
            WHERE id = %(id)s
            ''',
            {
                "status": status,
                "responseFingerprint": (
                    content_fingerprint(raw_response) if raw_response is not None else None
                ),
                "errorCode": error_code,
                "durationMs": max(0, int(duration_ms)),
                "completedAt": datetime.now(timezone.utc).replace(tzinfo=None),
                "id": audit_id,
            },
        )
    except Exception as exc:
        logger.warning("AI privacy audit completion failed: %s", exc.__class__.__name__)
        if get_settings().ai_privacy_audit_required:
            raise PrivacyAuditUnavailable("AI privacy audit storage is required but unavailable") from exc
