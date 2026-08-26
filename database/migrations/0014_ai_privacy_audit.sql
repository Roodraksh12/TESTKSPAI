-- Privacy metadata for LLM-bound requests in the isolated hackathon database.
-- No prompt, completion, token mapping, person name or case narrative is stored
-- in this table. Request/response fingerprints are keyed HMACs created by the
-- backend so the audit can correlate events without retaining their contents.

CREATE TABLE IF NOT EXISTS "AiRequestAudit" (
    id text NOT NULL PRIMARY KEY,
    "officerId" text NOT NULL,
    "sessionId" text,
    purpose text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    "processingMode" text NOT NULL,
    external boolean NOT NULL,
    "zdrEnforced" boolean NOT NULL DEFAULT false,
    "redactionApplied" boolean NOT NULL DEFAULT false,
    "redactionCounts" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "egressCharacters" integer NOT NULL DEFAULT 0,
    "caseIds" text[] NOT NULL DEFAULT '{}',
    "toolNames" text[] NOT NULL DEFAULT '{}',
    "requestFingerprint" text NOT NULL,
    "responseFingerprint" text,
    status text NOT NULL DEFAULT 'STARTED',
    "errorCode" text,
    "durationMs" integer,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" timestamp(3) without time zone,
    CONSTRAINT "AiRequestAudit_officerId_fkey"
      FOREIGN KEY ("officerId") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "AiRequestAudit_processingMode_check" CHECK (
      "processingMode" IN ('SANITISED_EXTERNAL', 'PRIVATE_MODEL')
    ),
    CONSTRAINT "AiRequestAudit_status_check" CHECK (
      status IN ('STARTED', 'SUCCEEDED', 'FAILED', 'BLOCKED')
    ),
    CONSTRAINT "AiRequestAudit_egressCharacters_check" CHECK ("egressCharacters" >= 0),
    CONSTRAINT "AiRequestAudit_durationMs_check" CHECK ("durationMs" IS NULL OR "durationMs" >= 0)
);

ALTER TABLE "ChatMessage"
  ADD COLUMN IF NOT EXISTS "privacyMetadata" jsonb;

CREATE INDEX IF NOT EXISTS "AiRequestAudit_officer_created_idx"
  ON "AiRequestAudit" ("officerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AiRequestAudit_mode_status_created_idx"
  ON "AiRequestAudit" ("processingMode", status, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AiRequestAudit_case_ids_gin_idx"
  ON "AiRequestAudit" USING gin ("caseIds");
