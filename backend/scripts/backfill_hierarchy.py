"""Re-apply hierarchy backfill from seed (safe upsert)."""

from __future__ import annotations

from pathlib import Path

from app.services.db import get_conn

ROOT = Path(__file__).resolve().parents[2]
# Officer/hierarchy backfill from seed (0004 hierarchy + 0005 command ranges).

SQL = '''
INSERT INTO "CommandRange" (id, name) VALUES
  ('cmd-range-bengaluru', 'Bengaluru Range'),
  ('cmd-range-mysuru', 'Mysuru Range')
ON CONFLICT (id) DO NOTHING;

UPDATE "District"
SET "commandRangeId" = 'cmd-range-bengaluru'
WHERE id = 'district-bengaluru-urban'
  AND ("commandRangeId" IS NULL OR "commandRangeId" = '');

UPDATE "District"
SET "commandRangeId" = 'cmd-range-mysuru'
WHERE id = 'district-mysuru'
  AND ("commandRangeId" IS NULL OR "commandRangeId" = '');

INSERT INTO "Range" (id, name, "districtId") VALUES
  ('range-east-bengaluru', 'East Bengaluru Subdivision', 'district-bengaluru-urban')
ON CONFLICT (id) DO NOTHING;

UPDATE "PoliceStation"
SET "rangeId" = 'range-east-bengaluru'
WHERE id IN ('station-whitefield-ps', 'station-indiranagar-ps')
  AND "rangeId" IS NULL;

INSERT INTO "Officer" (
  id, "badgeId", "passwordHash", name, role, "stationId",
  email, "districtId", "rangeId", "reportingOfficerId",
  "hierarchyPath", status, "createdById"
) VALUES (
  'officer-police-it', 'KA-IT-0001',
  '$2b$10$9xGWyAisITUSGE7IG0iP0uPAPquMfRzCKcT1ZGtQ.RDK1rmmX0NF2',
  'Police IT (System Admin)', 'POLICE_IT', NULL,
  'police.it@ksp.local', NULL, NULL, NULL,
  'it'::ltree, 'ACTIVE', NULL
)
ON CONFLICT ("badgeId") DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  role = EXCLUDED.role,
  status = 'ACTIVE',
  "hierarchyPath" = COALESCE("Officer"."hierarchyPath", EXCLUDED."hierarchyPath");

UPDATE "Officer" o
SET "districtId" = COALESCE(o."districtId", ps."districtId"),
    "rangeId" = COALESCE(o."rangeId", ps."rangeId")
FROM "PoliceStation" ps
WHERE o."stationId" = ps.id;

UPDATE "Officer" o
SET "commandRangeId" = COALESCE(o."commandRangeId", d."commandRangeId")
FROM "District" d
WHERE o."districtId" = d.id
  AND d."commandRangeId" IS NOT NULL;

UPDATE "Officer"
SET "hierarchyPath" = 'it.sp_demo'::ltree,
    "reportingOfficerId" = 'officer-police-it',
    status = COALESCE(status, 'ACTIVE')
WHERE id = 'officer-sp-demo';

UPDATE "Officer"
SET "hierarchyPath" = 'it.sp_demo.sho_demo'::ltree,
    "reportingOfficerId" = 'officer-sp-demo',
    status = COALESCE(status, 'ACTIVE')
WHERE id = 'officer-inspector-demo';

UPDATE "Officer"
SET "hierarchyPath" = 'it.sp_demo.sho_demo.con_demo'::ltree,
    "reportingOfficerId" = 'officer-inspector-demo',
    status = COALESCE(status, 'ACTIVE')
WHERE id = 'officer-constable-demo';
'''


def main() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(SQL)
        conn.commit()
    print("Hierarchy seed backfill OK")


if __name__ == "__main__":
    main()
