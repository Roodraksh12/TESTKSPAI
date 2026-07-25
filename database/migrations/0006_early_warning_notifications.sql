-- Persist explainable hotspot warnings and per-officer read state.
-- Warning generation remains jurisdiction-neutral; reads are always scoped by the API.

ALTER TABLE "Alert"
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "crimeType" TEXT,
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "firstDetectedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "lastDetectedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS "Alert_fingerprint_key"
  ON "Alert"(fingerprint)
  WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Alert_active_station_risk_idx"
  ON "Alert"("stationId", status, "riskScore" DESC);

CREATE TABLE IF NOT EXISTS "AlertRead" (
  "officerId" TEXT NOT NULL REFERENCES "Officer"(id) ON DELETE CASCADE,
  "alertId" TEXT NOT NULL REFERENCES "Alert"(id) ON DELETE CASCADE,
  "readAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("officerId", "alertId")
);

CREATE INDEX IF NOT EXISTS "AlertRead_officer_read_idx"
  ON "AlertRead"("officerId", "readAt" DESC);

COMMENT ON COLUMN "Alert".fingerprint IS
  'Stable station/grid/crime key used to update a warning instead of duplicating it';
COMMENT ON COLUMN "Alert".evidence IS
  'Explainable current-window and baseline inputs used to calculate riskScore';
