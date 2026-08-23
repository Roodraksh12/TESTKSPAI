"""Apply migration 0007_case_diary_evidence.sql."""

from __future__ import annotations

from pathlib import Path

from app.services.db import get_conn

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "database" / "migrations" / "0007_case_diary_evidence.sql"


def main() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    print("Applied", MIGRATION.name)


if __name__ == "__main__":
    main()
