-- Prisma-compatible schema for KSP Portal (PascalCase tables / camelCase columns)
-- Matches backend SQL queries against Supabase Postgres

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('CONSTABLE', 'INSPECTOR', 'SP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'UNDER_INVESTIGATION', 'CHARGESHEETED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PersonRole" AS ENUM ('ACCUSED', 'VICTIM', 'WITNESS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RelationType" AS ENUM ('CO_ACCUSED', 'SAME_ADDRESS', 'SAME_PHONE', 'PRIOR_CASE_TOGETHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AlertType" AS ENUM ('HOTSPOT', 'ANOMALY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Rating" AS ENUM ('UP', 'DOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "District" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "PoliceStation" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "districtId" TEXT NOT NULL REFERENCES "District"(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Officer" (
  id TEXT PRIMARY KEY,
  "badgeId" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  name TEXT NOT NULL,
  role "Role" NOT NULL,
  "stationId" TEXT NOT NULL REFERENCES "PoliceStation"(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "Case" (
  id TEXT PRIMARY KEY,
  "firNumber" TEXT NOT NULL UNIQUE,
  "stationId" TEXT NOT NULL REFERENCES "PoliceStation"(id) ON DELETE RESTRICT,
  "crimeType" TEXT NOT NULL,
  status "CaseStatus" NOT NULL DEFAULT 'OPEN',
  "incidentDate" TIMESTAMPTZ NOT NULL,
  "reportedDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  summary TEXT,
  "rawExtractedText" TEXT,
  "createdFromScan" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "Person" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role "PersonRole" NOT NULL,
  phone TEXT,
  address TEXT
);

CREATE TABLE IF NOT EXISTS "CasePerson" (
  id TEXT PRIMARY KEY,
  "caseId" TEXT NOT NULL REFERENCES "Case"(id) ON DELETE CASCADE,
  "personId" TEXT NOT NULL REFERENCES "Person"(id) ON DELETE CASCADE,
  role "PersonRole" NOT NULL
);

CREATE TABLE IF NOT EXISTS "Connection" (
  id TEXT PRIMARY KEY,
  "personAId" TEXT NOT NULL REFERENCES "Person"(id) ON DELETE CASCADE,
  "personBId" TEXT NOT NULL REFERENCES "Person"(id) ON DELETE CASCADE,
  "relationType" "RelationType" NOT NULL,
  "sourceCaseId" TEXT REFERENCES "Case"(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "CaseMatch" (
  id TEXT PRIMARY KEY,
  "caseId" TEXT NOT NULL REFERENCES "Case"(id) ON DELETE CASCADE,
  "matchedCaseId" TEXT REFERENCES "Case"(id) ON DELETE SET NULL,
  "matchedPersonId" TEXT REFERENCES "Person"(id) ON DELETE SET NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL,
  status "MatchStatus" NOT NULL DEFAULT 'PENDING',
  reason TEXT
);

CREATE TABLE IF NOT EXISTS "ChatSession" (
  id TEXT PRIMARY KEY,
  "officerId" TEXT NOT NULL REFERENCES "Officer"(id) ON DELETE CASCADE,
  "activeCaseId" TEXT REFERENCES "Case"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  id TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL REFERENCES "ChatSession"(id) ON DELETE CASCADE,
  role "MessageRole" NOT NULL,
  content TEXT NOT NULL,
  "sourceCaseIds" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id TEXT PRIMARY KEY,
  "officerId" TEXT NOT NULL REFERENCES "Officer"(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  details TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Alert" (
  id TEXT PRIMARY KEY,
  "stationId" TEXT NOT NULL REFERENCES "PoliceStation"(id) ON DELETE CASCADE,
  type "AlertType" NOT NULL,
  "zoneLabel" TEXT NOT NULL,
  "riskScore" DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Feedback" (
  id TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL UNIQUE REFERENCES "ChatMessage"(id) ON DELETE CASCADE,
  "officerId" TEXT NOT NULL REFERENCES "Officer"(id) ON DELETE CASCADE,
  rating "Rating" NOT NULL,
  comment TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "PoliceStation_districtId_idx" ON "PoliceStation"("districtId");
CREATE INDEX IF NOT EXISTS "Officer_stationId_idx" ON "Officer"("stationId");
CREATE INDEX IF NOT EXISTS "Case_stationId_idx" ON "Case"("stationId");
CREATE INDEX IF NOT EXISTS "Case_incidentDate_idx" ON "Case"("incidentDate");
CREATE INDEX IF NOT EXISTS "CasePerson_caseId_idx" ON "CasePerson"("caseId");
CREATE INDEX IF NOT EXISTS "CaseMatch_caseId_idx" ON "CaseMatch"("caseId");
CREATE INDEX IF NOT EXISTS "AuditLog_officerId_createdAt_idx" ON "AuditLog"("officerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Alert_stationId_riskScore_idx" ON "Alert"("stationId", "riskScore" DESC);
