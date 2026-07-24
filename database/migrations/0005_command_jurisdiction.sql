-- Command-level jurisdiction (IGP range above districts).
-- "Range" remains subdivision (DySP). "CommandRange" = IGP range of several districts.

-- IGP command range (several districts)
CREATE TABLE IF NOT EXISTS "CommandRange" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

ALTER TABLE "District"
  ADD COLUMN IF NOT EXISTS "commandRangeId" TEXT REFERENCES "CommandRange"(id) ON DELETE SET NULL;

ALTER TABLE "Officer"
  ADD COLUMN IF NOT EXISTS "commandRangeId" TEXT REFERENCES "CommandRange"(id) ON DELETE SET NULL;

-- DIG may cover multiple districts
CREATE TABLE IF NOT EXISTS "OfficerDistrict" (
  "officerId" TEXT NOT NULL REFERENCES "Officer"(id) ON DELETE CASCADE,
  "districtId" TEXT NOT NULL REFERENCES "District"(id) ON DELETE CASCADE,
  PRIMARY KEY ("officerId", "districtId")
);

CREATE INDEX IF NOT EXISTS district_command_range_idx ON "District" ("commandRangeId");
CREATE INDEX IF NOT EXISTS officer_command_range_idx ON "Officer" ("commandRangeId");

COMMENT ON TABLE "CommandRange" IS 'IGP-level range covering several districts (chart: Range)';
COMMENT ON TABLE "Range" IS 'DySP subdivision under a district (chart: Sub-division); not IGP range';

-- Seed Bengaluru command range
INSERT INTO "CommandRange" (id, name) VALUES
  ('cmd-range-bengaluru', 'Bengaluru Range'),
  ('cmd-range-mysuru', 'Mysuru Range')
ON CONFLICT (id) DO NOTHING;

UPDATE "District"
SET "commandRangeId" = 'cmd-range-bengaluru'
WHERE id IN ('district-bengaluru-urban')
  AND ("commandRangeId" IS NULL OR "commandRangeId" = '');

UPDATE "District"
SET "commandRangeId" = 'cmd-range-mysuru'
WHERE id IN ('district-mysuru')
  AND ("commandRangeId" IS NULL OR "commandRangeId" = '');

-- Demo SP linked to Bengaluru Urban district + command range for consistency
UPDATE "Officer"
SET "districtId" = COALESCE("districtId", 'district-bengaluru-urban'),
    "commandRangeId" = COALESCE("commandRangeId", 'cmd-range-bengaluru')
WHERE id = 'officer-sp-demo';

UPDATE "Officer"
SET "districtId" = COALESCE("districtId", 'district-bengaluru-urban'),
    "rangeId" = COALESCE("rangeId", 'range-east-bengaluru')
WHERE id IN ('officer-inspector-demo', 'officer-constable-demo');
