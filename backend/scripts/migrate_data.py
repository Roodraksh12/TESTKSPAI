"""Copy legacy Prisma/Postgres rows into Supabase tables.

This script is intentionally one-way and idempotent at the table level. Run it
after applying database/migrations/*.sql.
"""

from __future__ import annotations

import os
from collections.abc import Iterable

import psycopg
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

LEGACY_DATABASE_URL = os.environ["LEGACY_DATABASE_URL"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

TABLE_MAP = [
    ("District", "districts", {"id": "id", "name": "name"}),
    (
        "PoliceStation",
        "police_stations",
        {"id": "id", "name": "name", "districtId": "district_id"},
    ),
    (
        "Officer",
        "officers",
        {
            "id": "id",
            "badgeId": "badge_id",
            "passwordHash": "password_hash",
            "name": "name",
            "role": "role",
            "stationId": "station_id",
        },
    ),
    (
        "Case",
        "cases",
        {
            "id": "id",
            "firNumber": "fir_number",
            "stationId": "station_id",
            "crimeType": "crime_type",
            "status": "status",
            "incidentDate": "incident_date",
            "reportedDate": "reported_date",
            "latitude": "latitude",
            "longitude": "longitude",
            "summary": "summary",
            "rawExtractedText": "raw_extracted_text",
            "createdFromScan": "created_from_scan",
        },
    ),
    ("Person", "persons", {"id": "id", "name": "name", "role": "role", "phone": "phone", "address": "address"}),
    ("CasePerson", "case_persons", {"id": "id", "caseId": "case_id", "personId": "person_id", "role": "role"}),
    (
        "Connection",
        "connections",
        {
            "id": "id",
            "personAId": "person_a_id",
            "personBId": "person_b_id",
            "relationType": "relation_type",
            "sourceCaseId": "source_case_id",
        },
    ),
    (
        "CaseMatch",
        "case_matches",
        {
            "id": "id",
            "caseId": "case_id",
            "matchedCaseId": "matched_case_id",
            "matchedPersonId": "matched_person_id",
            "confidenceScore": "confidence_score",
            "status": "status",
            "reason": "reason",
        },
    ),
    (
        "AuditLog",
        "audit_logs",
        {
            "id": "id",
            "officerId": "officer_id",
            "action": "action",
            "targetType": "target_type",
            "targetId": "target_id",
            "details": "details",
            "createdAt": "created_at",
        },
    ),
    (
        "Alert",
        "alerts",
        {
            "id": "id",
            "stationId": "station_id",
            "type": "type",
            "zoneLabel": "zone_label",
            "riskScore": "risk_score",
            "reason": "reason",
            "createdAt": "created_at",
        },
    ),
]


def chunks(rows: list[dict], size: int = 500) -> Iterable[list[dict]]:
    for index in range(0, len(rows), size):
        yield rows[index : index + size]


def main() -> None:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    with psycopg.connect(LEGACY_DATABASE_URL, row_factory=psycopg.rows.dict_row) as conn:
        for legacy_table, target_table, columns in TABLE_MAP:
            selected = ", ".join(f'"{name}"' for name in columns)
            rows = conn.execute(f'select {selected} from "{legacy_table}"').fetchall()
            payload = [
                {target: row[source] for source, target in columns.items()}
                for row in rows
            ]
            for batch in chunks(payload):
                supabase.table(target_table).upsert(batch).execute()

            count = supabase.table(target_table).select("id", count="exact").execute().count
            print(f"{legacy_table} -> {target_table}: copied {len(payload)} rows, target has {count}")


if __name__ == "__main__":
    main()
