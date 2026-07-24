-- Additive hierarchy + invitation auth on PascalCase schema (0003).
-- Safe to re-run: uses IF NOT EXISTS / guarded ALTER where possible.

CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Officer account lifecycle
DO $$ BEGIN
  CREATE TYPE "OfficerStatus" AS ENUM (
    'PENDING_INVITE',
    'MUST_CHANGE_PASSWORD',
    'ACTIVE',
    'DISABLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ResetRequestStatus" AS ENUM (
    'PENDING',
    'FULFILLED',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Expand Role enum (keep CONSTABLE | INSPECTOR | SP)
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'POLICE_IT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DGP_IGP'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADGP'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'IGP'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DIG'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADDL_SP_DCP'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ASP_ACP'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DYSP'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SHO'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SI'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ASI'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HEAD_CONSTABLE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Range / subdivision under District
CREATE TABLE IF NOT EXISTS "Range" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "districtId" TEXT NOT NULL REFERENCES "District"(id) ON DELETE RESTRICT
);

ALTER TABLE "PoliceStation"
  ADD COLUMN IF NOT EXISTS "rangeId" TEXT REFERENCES "Range"(id) ON DELETE SET NULL;

-- Officer additive columns
ALTER TABLE "Officer" ALTER COLUMN "stationId" DROP NOT NULL;

ALTER TABLE "Officer" ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE "Officer" ADD COLUMN IF NOT EXISTS "districtId" TEXT REFERENCES "District"(id) ON DELETE SET NULL;
ALTER TABLE "Officer" ADD COLUMN IF NOT EXISTS "rangeId" TEXT REFERENCES "Range"(id) ON DELETE SET NULL;
ALTER TABLE "Officer" ADD COLUMN IF NOT EXISTS "reportingOfficerId" TEXT REFERENCES "Officer"(id) ON DELETE SET NULL;
ALTER TABLE "Officer" ADD COLUMN IF NOT EXISTS "hierarchyPath" ltree;
ALTER TABLE "Officer" ADD COLUMN IF NOT EXISTS status "OfficerStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Officer" ADD COLUMN IF NOT EXISTS "createdById" TEXT REFERENCES "Officer"(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS officer_email_unique
  ON "Officer" (email) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS officer_hierarchy_path_gist
  ON "Officer" USING GIST ("hierarchyPath");

CREATE TABLE IF NOT EXISTS "Invitation" (
  id TEXT PRIMARY KEY,
  "invitedOfficerId" TEXT NOT NULL REFERENCES "Officer"(id) ON DELETE CASCADE,
  "invitedById" TEXT NOT NULL REFERENCES "Officer"(id) ON DELETE RESTRICT,
  "tempPasswordHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  channel TEXT NOT NULL DEFAULT 'email',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "PasswordResetRequest" (
  id TEXT PRIMARY KEY,
  "officerId" TEXT NOT NULL REFERENCES "Officer"(id) ON DELETE CASCADE,
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status "ResetRequestStatus" NOT NULL DEFAULT 'PENDING',
  "fulfilledById" TEXT REFERENCES "Officer"(id) ON DELETE SET NULL,
  "fulfilledAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS password_reset_pending_idx
  ON "PasswordResetRequest" ("officerId", status);

-- Demo Range for Bengaluru Urban
INSERT INTO "Range" (id, name, "districtId") VALUES
  ('range-east-bengaluru', 'East Bengaluru Subdivision', 'district-bengaluru-urban')
ON CONFLICT (id) DO NOTHING;

UPDATE "PoliceStation"
SET "rangeId" = 'range-east-bengaluru'
WHERE id IN ('station-whitefield-ps', 'station-indiranagar-ps')
  AND "rangeId" IS NULL;

-- Backfill districtId from station for existing officers
UPDATE "Officer" o
SET "districtId" = ps."districtId",
    "rangeId" = ps."rangeId"
FROM "PoliceStation" ps
WHERE o."stationId" = ps.id
  AND o."districtId" IS NULL;

-- Police IT root account (password demo1234)
INSERT INTO "Officer" (
  id, "badgeId", "passwordHash", name, role, "stationId",
  email, "districtId", "rangeId", "reportingOfficerId",
  "hierarchyPath", status, "createdById"
) VALUES (
  'officer-police-it',
  'KA-IT-0001',
  '$2b$10$9xGWyAisITUSGE7IG0iP0uPAPquMfRzCKcT1ZGtQ.RDK1rmmX0NF2',
  'Police IT (System Admin)',
  'POLICE_IT',
  NULL,
  'police.it@ksp.local',
  NULL,
  NULL,
  NULL,
  'it'::ltree,
  'ACTIVE',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  "hierarchyPath" = EXCLUDED."hierarchyPath",
  role = EXCLUDED.role,
  status = EXCLUDED.status;

-- Hierarchy for demo officers: it -> sp -> sho(inspector) -> constable
UPDATE "Officer"
SET "hierarchyPath" = 'it.sp_demo'::ltree,
    "reportingOfficerId" = 'officer-police-it',
    "createdById" = 'officer-police-it',
    status = COALESCE(status, 'ACTIVE')
WHERE id = 'officer-sp-demo';

UPDATE "Officer"
SET "hierarchyPath" = 'it.sp_demo.sho_demo'::ltree,
    "reportingOfficerId" = 'officer-sp-demo',
    "createdById" = 'officer-sp-demo',
    status = COALESCE(status, 'ACTIVE')
WHERE id = 'officer-inspector-demo';

UPDATE "Officer"
SET "hierarchyPath" = 'it.sp_demo.sho_demo.con_demo'::ltree,
    "reportingOfficerId" = 'officer-inspector-demo',
    "createdById" = 'officer-inspector-demo',
    status = COALESCE(status, 'ACTIVE')
WHERE id = 'officer-constable-demo';

-- Any remaining officers without a path get a placeholder under it
UPDATE "Officer"
SET "hierarchyPath" = ('it.orphan_' || replace(id, '-', '_'))::ltree
WHERE "hierarchyPath" IS NULL;

ALTER TABLE "Officer" ALTER COLUMN "hierarchyPath" SET NOT NULL;
