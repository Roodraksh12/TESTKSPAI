-- Durable transient FIR jobs and database-backed case-diary documents.
-- This remains isolated hackathon/test infrastructure; a police-scale system
-- should replace bytea payloads with an approved encrypted object store.

CREATE TABLE IF NOT EXISTS "FirIntakeJob" (
  id text PRIMARY KEY,
  "officerId" text NOT NULL REFERENCES "Officer"(id) ON DELETE CASCADE,
  filename text NOT NULL,
  "contentType" text,
  "documentData" bytea,
  status text NOT NULL DEFAULT 'queued',
  stage text NOT NULL DEFAULT 'Queued',
  result jsonb,
  error text,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
  "finishedAt" timestamptz,
  CONSTRAINT "FirIntakeJob_status_check"
    CHECK (status IN ('queued', 'processing', 'done', 'error'))
);

CREATE INDEX IF NOT EXISTS "FirIntakeJob_officer_created_idx"
  ON "FirIntakeJob" ("officerId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "FirIntakeJob_finished_idx"
  ON "FirIntakeJob" ("finishedAt")
  WHERE "finishedAt" IS NOT NULL;

ALTER TABLE "Document"
  ALTER COLUMN path DROP NOT NULL;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "contentType" text,
  ADD COLUMN IF NOT EXISTS "sizeBytes" integer,
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS "documentData" bytea,
  ADD COLUMN IF NOT EXISTS "uploadedById" text REFERENCES "Officer"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Document_case_created_idx"
  ON "Document" ("caseId", "createdAt" DESC);
