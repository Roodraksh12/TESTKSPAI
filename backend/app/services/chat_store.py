"""Session-wise persistence for the investigation copilot.

Chat history lives server-side in the ChatSession/ChatMessage tables rather than
in browser storage: an officer's questions are part of the investigation record,
need to survive a device change, and are subject to the same jurisdiction
scoping and audit expectations as everything else in the app.

Sessions are always filtered by officerId — one officer never reads another's
conversation, regardless of rank. Supervisory review happens through the audit
trail, which already records every CHAT_QUERY.
"""

from __future__ import annotations

from typing import Any

from app.services.db import execute, fetch_all, fetch_one, fetch_scalar, new_id, serialize_rows

# Roles the ChatMessage.role enum accepts.
ROLE_USER = "USER"
ROLE_ASSISTANT = "ASSISTANT"

TITLE_MAX_LEN = 60
UNTITLED = "New conversation"


def _derive_title(text: str | None) -> str:
    """Build a readable session label from a message.

    Markdown headings are stripped so an intake brief titled "## Network brief"
    reads as "Network brief" in the list rather than leaking syntax.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return UNTITLED
    first_line = next((ln.strip() for ln in cleaned.splitlines() if ln.strip()), "")
    first_line = first_line.lstrip("#").replace("**", "").strip()
    if not first_line:
        return UNTITLED
    if len(first_line) <= TITLE_MAX_LEN:
        return first_line
    return first_line[: TITLE_MAX_LEN - 1].rstrip() + "…"


def create_session(officer_id: str, active_case_id: str | None = None) -> str:
    session_id = new_id()
    execute(
        '''
        INSERT INTO "ChatSession" (id, "officerId", "activeCaseId")
        VALUES (%(id)s, %(officerId)s, %(activeCaseId)s)
        ''',
        {"id": session_id, "officerId": officer_id, "activeCaseId": active_case_id},
    )
    return session_id


def session_belongs_to(session_id: str, officer_id: str) -> bool:
    row = fetch_one(
        'SELECT id FROM "ChatSession" WHERE id = %(id)s AND "officerId" = %(officerId)s',
        {"id": session_id, "officerId": officer_id},
    )
    return row is not None


def append_message(
    session_id: str,
    role: str,
    content: str,
    source_case_ids: list[str] | None = None,
) -> None:
    execute(
        '''
        INSERT INTO "ChatMessage" (id, "sessionId", role, content, "sourceCaseIds")
        VALUES (%(id)s, %(sessionId)s, %(role)s, %(content)s, %(sourceCaseIds)s)
        ''',
        {
            "id": new_id(),
            "sessionId": session_id,
            "role": role,
            "content": content,
            "sourceCaseIds": source_case_ids or [],
        },
    )


def ensure_session(
    officer_id: str, session_id: str | None, active_case_id: str | None = None
) -> str:
    """Return a usable session id, creating one when absent or not the officer's.

    Falling back to a fresh session rather than raising keeps a stale session id
    in a long-lived browser tab from breaking the officer's next question.
    """
    if session_id and session_belongs_to(session_id, officer_id):
        return session_id
    return create_session(officer_id, active_case_id)


def list_sessions(officer_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """Session list for the sidebar, newest activity first."""
    rows = fetch_all(
        '''
        SELECT
            s.id,
            s."activeCaseId",
            s."createdAt",
            c."firNumber" AS "activeCaseFir",
            COUNT(m.id)::int AS "messageCount",
            MAX(m."createdAt") AS "lastMessageAt",
            (
                SELECT m2.content FROM "ChatMessage" m2
                WHERE m2."sessionId" = s.id AND m2.role = 'USER'
                ORDER BY m2."createdAt" ASC LIMIT 1
            ) AS "firstUserMessage",
            (
                SELECT m3.content FROM "ChatMessage" m3
                WHERE m3."sessionId" = s.id
                ORDER BY m3."createdAt" ASC LIMIT 1
            ) AS "firstMessage"
        FROM "ChatSession" s
        LEFT JOIN "ChatMessage" m ON m."sessionId" = s.id
        LEFT JOIN "Case" c ON c.id = s."activeCaseId"
        WHERE s."officerId" = %(officerId)s
        GROUP BY s.id, s."activeCaseId", s."createdAt", c."firNumber"
        HAVING COUNT(m.id) > 0
        ORDER BY COALESCE(MAX(m."createdAt"), s."createdAt") DESC
        LIMIT %(limit)s
        ''',
        {"officerId": officer_id, "limit": limit},
    )

    sessions = []
    for row in serialize_rows(rows):
        # Prefer what the officer actually asked; an intake-seeded session opens
        # with an assistant brief, so fall back to that when there's no question yet.
        title = _derive_title(row.get("firstUserMessage") or row.get("firstMessage"))
        sessions.append(
            {
                "id": row["id"],
                "title": title,
                "activeCaseId": row.get("activeCaseId"),
                "activeCaseFir": row.get("activeCaseFir"),
                "messageCount": row.get("messageCount") or 0,
                "createdAt": row.get("createdAt"),
                "lastMessageAt": row.get("lastMessageAt") or row.get("createdAt"),
            }
        )
    return sessions


def get_session_messages(session_id: str, officer_id: str) -> list[dict[str, Any]] | None:
    if not session_belongs_to(session_id, officer_id):
        return None
    rows = fetch_all(
        '''
        SELECT role, content, "sourceCaseIds", "createdAt"
        FROM "ChatMessage"
        WHERE "sessionId" = %(sessionId)s
        ORDER BY "createdAt" ASC
        ''',
        {"sessionId": session_id},
    )
    return [
        {
            "role": "assistant" if row["role"] == ROLE_ASSISTANT else "user",
            "content": row["content"],
            "sources": row.get("sourceCaseIds") or [],
            "createdAt": row.get("createdAt"),
        }
        for row in serialize_rows(rows)
    ]


def delete_session(session_id: str, officer_id: str) -> bool:
    if not session_belongs_to(session_id, officer_id):
        return False
    # Messages are cleared explicitly rather than relying on ON DELETE CASCADE:
    # the deployed database defines this foreign key as RESTRICT, so a cascade
    # assumption would fail at runtime. Doing it in order works either way.
    execute('DELETE FROM "ChatMessage" WHERE "sessionId" = %(id)s', {"id": session_id})
    execute('DELETE FROM "ChatSession" WHERE id = %(id)s', {"id": session_id})
    return True


def count_sessions(officer_id: str) -> int:
    return int(
        fetch_scalar(
            'SELECT COUNT(*) FROM "ChatSession" WHERE "officerId" = %(officerId)s',
            {"officerId": officer_id},
        )
        or 0
    )
