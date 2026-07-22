"""Apply migration 0004 in two transactions (enum ADD VALUE must commit first)."""

from __future__ import annotations

from pathlib import Path

from app.services.db import get_conn

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "database" / "migrations" / "0004_hierarchy_auth.sql"

ENUM_PREFIX_MARKERS = (
    'ALTER TYPE "Role" ADD VALUE',
    'CREATE TYPE "OfficerStatus"',
    'CREATE TYPE "ResetRequestStatus"',
    "CREATE EXTENSION IF NOT EXISTS ltree",
    "CREATE EXTENSION IF NOT EXISTS pgcrypto",
)


def main() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    # Split: everything up to and including Role ADD VALUE statements first
    lines = sql.splitlines(keepends=True)
    phase1: list[str] = []
    phase2: list[str] = []
    in_phase1 = True
    for line in lines:
        if in_phase1 and line.startswith("CREATE TABLE IF NOT EXISTS \"Range\""):
            in_phase1 = False
        if in_phase1:
            phase1.append(line)
        else:
            phase2.append(line)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("".join(phase1))
        conn.commit()
        print("Phase 1 (extensions + enums) committed.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("".join(phase2))
        conn.commit()
        print("Phase 2 (tables + seed) committed.")
    print("Applied", MIGRATION.name)


if __name__ == "__main__":
    main()
