from __future__ import annotations

import pytest

from app.services import chat_store
from app.services.case_access import load_officer_by_badge


@pytest.fixture(scope="module")
def officer(db_available: bool):
    if not db_available:
        pytest.skip("local Postgres not reachable")
    row = load_officer_by_badge("KA-INS-4471")
    assert row is not None
    return row


def test_derive_title_strips_markdown_heading() -> None:
    assert chat_store._derive_title("## Network brief\n\nbody") == "Network brief"


def test_derive_title_truncates_long_text() -> None:
    title = chat_store._derive_title("x" * 200)
    assert len(title) <= chat_store.TITLE_MAX_LEN
    assert title.endswith("…")


def test_derive_title_falls_back_when_empty() -> None:
    assert chat_store._derive_title("   ") == chat_store.UNTITLED
    assert chat_store._derive_title(None) == chat_store.UNTITLED


def test_session_roundtrip_and_delete(officer) -> None:
    session_id = chat_store.create_session(officer["id"])
    try:
        chat_store.append_message(session_id, chat_store.ROLE_USER, "Which cases risk default bail?")
        chat_store.append_message(session_id, chat_store.ROLE_ASSISTANT, "Three cases.", ["FIR/2026/0001"])

        messages = chat_store.get_session_messages(session_id, officer["id"])
        assert messages is not None
        assert [m["role"] for m in messages] == ["user", "assistant"]
        assert messages[1]["sources"] == ["FIR/2026/0001"]

        listed = chat_store.list_sessions(officer["id"])
        entry = next((s for s in listed if s["id"] == session_id), None)
        assert entry is not None
        # Title comes from the officer's question, not the assistant's answer.
        assert entry["title"] == "Which cases risk default bail?"
        assert entry["messageCount"] == 2
    finally:
        assert chat_store.delete_session(session_id, officer["id"]) is True

    assert chat_store.get_session_messages(session_id, officer["id"]) is None


def test_officer_cannot_read_or_delete_another_officers_session(officer, db_available: bool) -> None:
    other = load_officer_by_badge("KA-CON-1001")
    assert other is not None
    assert other["id"] != officer["id"]

    session_id = chat_store.create_session(officer["id"])
    try:
        chat_store.append_message(session_id, chat_store.ROLE_USER, "Confidential line of enquiry")
        assert chat_store.get_session_messages(session_id, other["id"]) is None
        assert chat_store.delete_session(session_id, other["id"]) is False
        # Still intact for its owner after the failed cross-officer delete.
        assert chat_store.get_session_messages(session_id, officer["id"]) is not None
    finally:
        chat_store.delete_session(session_id, officer["id"])


def test_ensure_session_recovers_from_a_stale_id(officer) -> None:
    resolved = chat_store.ensure_session(officer["id"], "does-not-exist")
    try:
        assert resolved != "does-not-exist"
        assert chat_store.session_belongs_to(resolved, officer["id"])
    finally:
        chat_store.delete_session(resolved, officer["id"])


def test_empty_sessions_are_hidden_from_the_list(officer) -> None:
    session_id = chat_store.create_session(officer["id"])
    try:
        listed = chat_store.list_sessions(officer["id"])
        assert all(s["id"] != session_id for s in listed)
    finally:
        chat_store.delete_session(session_id, officer["id"])
