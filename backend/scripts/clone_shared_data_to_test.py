"""Copy the original app's data into this clone's isolated test database.

The source is read-only: `backend/.env`. The destination is the developer-only
`backend/.env.test`. The script refuses identical connection strings and
validates table columns before it clears the destination app tables.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
SOURCE_ENV = ROOT / "backend" / ".env"
TEST_ENV = ROOT / "backend" / ".env.test"

# Parent tables precede children. Officer's two self-references are restored
# after every officer row exists (see _copy_officers).
COPY_ORDER = [
    "CommandRange",
    "District",
    "Range",
    "PoliceStation",
    "Officer",
    "OfficerDistrict",
    "Invitation",
    "PasswordResetRequest",
    "Case",
    "Person",
    "CasePerson",
    "Connection",
    "CaseMatch",
    "ChatSession",
    "ChatMessage",
    "AuditLog",
    "Alert",
    "AlertRead",
    "Feedback",
    "CaseDiaryEntry",
    "Evidence",
    "Document",
    "DiaryEntryEvidence",
    "DiaryEntryPerson",
    "EvidencePerson",
]
# These tables exist only in the isolated clone. They must never be queried or
# copied from the round-one source database. They are cleared when the clone is
# refreshed so test workflow state cannot be mistaken for source data.
TEST_ONLY_TABLES = ["FinalReportVersion", "FinalReport", "CaseCustodyClock"]


def _database_url(path: Path) -> str:
    value = dotenv_values(path).get("DATABASE_URL")
    if not value:
        raise RuntimeError(f"DATABASE_URL is missing from {path}")
    return value


def _table_names(conn: psycopg.Connection) -> set[str]:
    rows = conn.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
        """
    ).fetchall()
    return {row[0] for row in rows}


def _columns(conn: psycopg.Connection, table: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = %(table)s
        ORDER BY ordinal_position
        """,
        {"table": table},
    ).fetchall()
    return [row[0] for row in rows]


def _quoted_columns(columns: list[str]) -> str:
    return ", ".join(f'"{column}"' for column in columns)


def _copy_query(source: psycopg.Connection, target: psycopg.Connection, select_sql: str, copy_sql: str) -> None:
    with source.cursor() as source_cursor, target.cursor() as target_cursor:
        with source_cursor.copy(select_sql) as read_copy, target_cursor.copy(copy_sql) as write_copy:
            for block in read_copy:
                write_copy.write(block)


def _copy_table(source: psycopg.Connection, target: psycopg.Connection, table: str) -> None:
    _copy_query(
        source,
        target,
        f'COPY "{table}" TO STDOUT (FORMAT BINARY)',
        f'COPY "{table}" FROM STDIN (FORMAT BINARY)',
    )


def _copy_officers(source: psycopg.Connection, target: psycopg.Connection) -> None:
    columns = _columns(source, "Officer")
    self_reference_columns = [column for column in ("reportingOfficerId", "createdById") if column in columns]
    regular_columns = [column for column in columns if column not in self_reference_columns]

    _copy_query(
        source,
        target,
        f'COPY (SELECT {_quoted_columns(regular_columns)} FROM "Officer") TO STDOUT (FORMAT BINARY)',
        f'COPY "Officer" ({_quoted_columns(regular_columns)}) FROM STDIN (FORMAT BINARY)',
    )
    if not self_reference_columns:
        return

    target.execute(
        f'CREATE TEMP TABLE "_clone_officer_refs" ("id" text PRIMARY KEY, '
        + ", ".join(f'"{column}" text' for column in self_reference_columns)
        + ") ON COMMIT DROP"
    )
    ref_columns = ["id", *self_reference_columns]
    _copy_query(
        source,
        target,
        f'COPY (SELECT {_quoted_columns(ref_columns)} FROM "Officer") TO STDOUT (FORMAT BINARY)',
        f'COPY "_clone_officer_refs" ({_quoted_columns(ref_columns)}) FROM STDIN (FORMAT BINARY)',
    )
    assignments = ", ".join(f'"{column}" = refs."{column}"' for column in self_reference_columns)
    target.execute(
        f'''
        UPDATE "Officer" AS officer
        SET {assignments}
        FROM "_clone_officer_refs" AS refs
        WHERE officer.id = refs.id
        '''
    )


def main() -> None:
    source_url = _database_url(SOURCE_ENV)
    test_url = _database_url(TEST_ENV)
    if source_url == test_url:
        raise RuntimeError("Source and test DATABASE_URL values are identical; refusing to copy")

    source_user = urlparse(source_url).username
    test_user = urlparse(test_url).username
    if source_user == test_user:
        raise RuntimeError("Source and test database users match; refusing to risk the original database")

    with psycopg.connect(source_url, connect_timeout=10) as source, psycopg.connect(test_url, connect_timeout=10) as target:
        source_tables = _table_names(source)
        target_tables = _table_names(target)
        missing_source = set(COPY_ORDER) - source_tables
        missing_target = set(COPY_ORDER + TEST_ONLY_TABLES) - target_tables
        if missing_source or missing_target:
            raise RuntimeError(
                f"Schema mismatch. Missing source={sorted(missing_source)}, missing test={sorted(missing_target)}"
            )
        for table in COPY_ORDER:
            if _columns(source, table) != _columns(target, table):
                raise RuntimeError(f"Column mismatch for {table}; refusing to replace test data")

        source_case_count = source.execute('SELECT COUNT(*) FROM "Case"').fetchone()[0]
        if source_case_count == 0:
            raise RuntimeError("Source has no cases; refusing to replace the test database")

        # This is intentionally a destination-only operation. The source
        # connection above only issues information_schema and COPY TO queries.
        truncate_tables = [*reversed(COPY_ORDER), *TEST_ONLY_TABLES]
        target.execute("TRUNCATE TABLE " + ", ".join(f'"{table}"' for table in truncate_tables) + " CASCADE")

        for table in COPY_ORDER:
            if table == "Officer":
                _copy_officers(source, target)
            else:
                _copy_table(source, target, table)
        target.commit()

    print(f"Copied {source_case_count} cases into the isolated test database.")


if __name__ == "__main__":
    main()
