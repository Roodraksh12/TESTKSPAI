"""Apply Prisma-compatible schema + demo seed to Supabase."""

from __future__ import annotations

from pathlib import Path

import bcrypt
from app.services.db import execute, fetch_all, get_conn

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "database" / "migrations" / "0003_prisma_compatible_schema.sql"

PASSWORD_HASH = bcrypt.hashpw(b"demo1234", bcrypt.gensalt(rounds=10)).decode()


def main() -> None:
    sql = SCHEMA.read_text(encoding="utf-8")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    print("Schema applied.")

    # Seed districts / stations / officers / sample cases
    execute(
        '''
        INSERT INTO "District" (id, name) VALUES
          ('district-bengaluru-urban', 'Bengaluru Urban'),
          ('district-mysuru', 'Mysuru')
        ON CONFLICT (id) DO NOTHING
        '''
    )
    execute(
        '''
        INSERT INTO "PoliceStation" (id, name, "districtId") VALUES
          ('station-whitefield', 'Whitefield PS', 'district-bengaluru-urban'),
          ('station-indiranagar', 'Indiranagar PS', 'district-bengaluru-urban'),
          ('station-kuvempunagar', 'Kuvempunagar PS', 'district-mysuru')
        ON CONFLICT (id) DO NOTHING
        '''
    )
    execute(
        '''
        INSERT INTO "Officer" (id, "badgeId", "passwordHash", name, role, "stationId") VALUES
          ('officer-constable-demo', 'KA-CON-1001', %(hash)s, 'Ramesh K (Demo Constable)', 'CONSTABLE', 'station-whitefield'),
          ('officer-inspector-demo', 'KA-INS-4471', %(hash)s, 'Suresh V (Demo Inspector)', 'INSPECTOR', 'station-whitefield'),
          ('officer-sp-demo', 'KA-SP-9999', %(hash)s, 'Priya M (Demo SP)', 'SP', 'station-whitefield')
        ON CONFLICT ("badgeId") DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash"
        ''',
        {"hash": PASSWORD_HASH},
    )
    execute(
        '''
        INSERT INTO "Person" (id, name, role, phone, address) VALUES
          ('person-ravi-kumar', 'Ravi Kumar', 'ACCUSED', '9876543210', '123 Main St, Whitefield'),
          ('person-sunil-rao', 'Sunil Rao', 'ACCUSED', '9988776655', '456 Cross, Indiranagar'),
          ('person-anita-d', 'Anita D', 'VICTIM', '9123456789', '789 1st Ave, Whitefield')
        ON CONFLICT (id) DO NOTHING
        '''
    )
    execute(
        '''
        INSERT INTO "Case" (
          id, "firNumber", "stationId", "crimeType", status, "incidentDate",
          "reportedDate", latitude, longitude, summary
        ) VALUES
          (
            'case-fir-2026-0001', 'FIR/2026/0001', 'station-whitefield', 'Theft',
            'UNDER_INVESTIGATION', '2026-06-15T10:00:00Z', '2026-06-16T09:00:00Z',
            12.986, 77.737, 'Two-wheeler theft reported from ITPL parking lot.'
          ),
          (
            'case-fir-2026-0002', 'FIR/2026/0002', 'station-whitefield', 'Chain Snatching',
            'OPEN', '2026-06-20T18:30:00Z', '2026-06-20T20:00:00Z',
            12.971, 77.750, 'Gold chain snatched by two men on a black motorcycle.'
          ),
          (
            'case-fir-2026-0003', 'FIR/2026/0003', 'station-whitefield', 'Burglary',
            'CHARGESHEETED', '2026-05-10T02:00:00Z', '2026-05-10T08:00:00Z',
            12.965, 77.740, 'House break-in at night. Electronics stolen.'
          )
        ON CONFLICT (id) DO NOTHING
        '''
    )
    execute(
        '''
        INSERT INTO "CasePerson" (id, "caseId", "personId", role) VALUES
          ('case-person-0001-ravi', 'case-fir-2026-0001', 'person-ravi-kumar', 'ACCUSED'),
          ('case-person-0001-anita', 'case-fir-2026-0001', 'person-anita-d', 'VICTIM'),
          ('case-person-0003-sunil', 'case-fir-2026-0003', 'person-sunil-rao', 'ACCUSED')
        ON CONFLICT (id) DO NOTHING
        '''
    )
    execute(
        '''
        INSERT INTO "Alert" (id, "stationId", type, "zoneLabel", "riskScore", reason, "createdAt") VALUES
          (
            'alert-itpl-back-gate', 'station-whitefield', 'HOTSPOT', 'ITPL Back Gate',
            92.0, '3 vehicle thefts in the last 14 days.', NOW()
          )
        ON CONFLICT (id) DO NOTHING
        '''
    )

    officers = fetch_all('SELECT "badgeId", name, role FROM "Officer" ORDER BY "badgeId"')
    print("Seeded officers:", officers)
    print("Done. Demo password for all: demo1234")


if __name__ == "__main__":
    main()
