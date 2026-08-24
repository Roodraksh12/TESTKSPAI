"""Apply migration 0012_case_report_sources.sql to the configured test DB."""

from __future__ import annotations

from pathlib import Path

from app.services.db import get_conn

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "database" / "migrations" / "0012_case_report_sources.sql"


def main() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(MIGRATION.read_text(encoding="utf-8"))
        conn.commit()
    print("Applied", MIGRATION.name)


if __name__ == "__main__":
    main()
