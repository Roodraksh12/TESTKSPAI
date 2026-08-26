from __future__ import annotations

from pathlib import Path

import pytest

from app.services import ai_privacy_audit
from app.services.ai_privacy import PrivacyContext
from app.services.case_access import load_officer_by_badge
from app.services.db import execute, fetch_one


def test_keyed_fingerprint_is_deterministic_without_exposing_content() -> None:
    first = ai_privacy_audit.content_fingerprint({"message": "Sensitive test text"})
    same = ai_privacy_audit.content_fingerprint({"message": "Sensitive test text"})
    different = ai_privacy_audit.content_fingerprint({"message": "Different text"})

    assert first == same
    assert first != different
    assert "Sensitive" not in first
    assert len(first) == 64


def test_privacy_migration_has_no_raw_prompt_or_completion_columns() -> None:
    migration = (
        Path(__file__).resolve().parents[3]
        / "database"
        / "migrations"
        / "0014_ai_privacy_audit.sql"
    ).read_text(encoding="utf-8")

    assert 'CREATE TABLE IF NOT EXISTS "AiRequestAudit"' in migration
    assert '"privacyMetadata" jsonb' in migration
    assert "prompt text" not in migration.lower()
    assert "completion text" not in migration.lower()
    assert '"requestFingerprint"' in migration


def test_ai_request_audit_roundtrip_uses_metadata_only(db_available: bool) -> None:
    if not db_available:
        pytest.skip("test Postgres is not reachable")
    officer = load_officer_by_badge("KA-INS-4471")
    if not officer:
        pytest.skip("seeded inspector account is unavailable")

    audit_id = ai_privacy_audit.begin_request(
        context=PrivacyContext(
            purpose="PRIVACY_TEST",
            officer_id=officer["id"],
            case_ids=(),
            tool_names=("search_cases",),
        ),
        provider="Test provider",
        model="test-model",
        processing_mode="SANITISED_EXTERNAL",
        external=True,
        zdr_enforced=True,
        redaction_counts={"PERSON": 2},
        egress_characters=120,
        raw_request={"message": "Sensitive test text"},
    )
    assert audit_id is not None
    try:
        ai_privacy_audit.finish_request(
            audit_id,
            status="SUCCEEDED",
            duration_ms=25,
            raw_response={"message": "Response text"},
        )
        row = fetch_one('SELECT * FROM "AiRequestAudit" WHERE id = %(id)s', {"id": audit_id})
        assert row is not None
        assert row["status"] == "SUCCEEDED"
        assert row["redactionCounts"] == {"PERSON": 2}
        assert row["zdrEnforced"] is True
        assert "Sensitive test text" not in str(row)
        assert "Response text" not in str(row)
    finally:
        execute('DELETE FROM "AiRequestAudit" WHERE id = %(id)s', {"id": audit_id})
