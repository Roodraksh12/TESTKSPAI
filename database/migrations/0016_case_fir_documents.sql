-- Private source-FIR storage for the isolated hackathon test database.
--
-- The API never exposes documentData in JSON. It is returned only through a
-- jurisdiction-checked, audited binary endpoint. A production deployment at
-- police scale should replace bytea with a department-approved encrypted
-- document/object store while keeping this metadata and access boundary.

CREATE TABLE IF NOT EXISTS "CaseFirDocument" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL UNIQUE,
    filename text NOT NULL,
    "contentType" text NOT NULL,
    "sizeBytes" integer NOT NULL,
    sha256 text NOT NULL,
    "documentData" bytea NOT NULL,
    "uploadedById" text NOT NULL,
    "uploadedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CaseFirDocument_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CaseFirDocument_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseFirDocument_contentType_check"
      CHECK ("contentType" IN ('application/pdf', 'image/jpeg', 'image/png')),
    CONSTRAINT "CaseFirDocument_sizeBytes_check"
      CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 20971520),
    CONSTRAINT "CaseFirDocument_sha256_check"
      CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS "CaseFirDocument_uploadedAt_idx"
  ON "CaseFirDocument" ("uploadedAt" DESC);
