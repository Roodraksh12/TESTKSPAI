"""Preview or apply the configured local chat-history retention policy.

The command is dry-run by default. Add --apply to delete complete chat sessions
whose most recent message is older than AI_CHAT_RETENTION_DAYS. AiRequestAudit
metadata is intentionally retained; it contains no prompt or completion text.
"""

from __future__ import annotations

import argparse

from app.config import get_settings
from app.services.db import get_conn


def candidate_session_ids(days: int) -> list[str]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT s.id
                FROM "ChatSession" s
                LEFT JOIN "ChatMessage" m ON m."sessionId" = s.id
                GROUP BY s.id, s."createdAt"
                HAVING COALESCE(MAX(m."createdAt"), s."createdAt")
                       < NOW() - (%(days)s * INTERVAL '1 day')
                ''',
                {"days": days},
            )
            return [row["id"] for row in cur.fetchall()]


def purge(days: int, *, apply: bool) -> int:
    if days < 1:
        raise ValueError("AI_CHAT_RETENTION_DAYS must be at least 1")
    session_ids = candidate_session_ids(days)
    if not apply or not session_ids:
        return len(session_ids)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'DELETE FROM "ChatMessage" WHERE "sessionId" = ANY(%(ids)s)',
                {"ids": session_ids},
            )
            cur.execute(
                'DELETE FROM "ChatSession" WHERE id = ANY(%(ids)s)',
                {"ids": session_ids},
            )
        conn.commit()
    return len(session_ids)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Delete eligible local chat sessions; without this flag only show a count.",
    )
    args = parser.parse_args()
    days = get_settings().ai_chat_retention_days
    count = purge(days, apply=args.apply)
    action = "Deleted" if args.apply else "Would delete"
    print(f"{action} {count} chat session(s) older than {days} day(s).")


if __name__ == "__main__":
    main()
