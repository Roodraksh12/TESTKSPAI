-- Structured, deterministic BNSS section 193 final-report drafts.
--
-- The mutable row stores the current working copy. FinalReportVersion stores
-- immutable snapshots after every meaningful workflow event so an approved
-- or exported report can always be reconstructed exactly as reviewed.

CREATE TABLE IF NOT EXISTS "FinalReport" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    "reportType" text NOT NULL DEFAULT 'CHARGE_SHEET',
    "sequenceNumber" integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'DRAFT',
    "formatVersion" text NOT NULL DEFAULT 'BNSS193-PROVISIONAL-V1',
    revision integer NOT NULL DEFAULT 1,
    "versionNumber" integer NOT NULL DEFAULT 1,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    validation jsonb NOT NULL DEFAULT '{"issues":[]}'::jsonb,
    "reviewNote" text,
    "createdById" text NOT NULL,
    "updatedById" text NOT NULL,
    "reviewedById" text,
    "approvedById" text,
    "submittedAt" timestamp(3) without time zone,
    "approvedAt" timestamp(3) without time zone,
    "lockedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "FinalReport_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "FinalReport_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "FinalReport_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "FinalReport_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "FinalReport_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "FinalReport_reportType_check" CHECK (
      "reportType" IN ('CHARGE_SHEET', 'CLOSURE_REPORT', 'SUPPLEMENTARY_CHARGE_SHEET')
    ),
    CONSTRAINT "FinalReport_status_check" CHECK (
      status IN ('DRAFT', 'READY_FOR_REVIEW', 'RETURNED', 'APPROVED', 'FILED')
    ),
    CONSTRAINT "FinalReport_sequenceNumber_check" CHECK ("sequenceNumber" > 0),
    CONSTRAINT "FinalReport_revision_check" CHECK (revision > 0),
    CONSTRAINT "FinalReport_versionNumber_check" CHECK ("versionNumber" > 0),
    CONSTRAINT "FinalReport_case_type_sequence_key"
      UNIQUE ("caseId", "reportType", "sequenceNumber")
);

CREATE TABLE IF NOT EXISTS "FinalReportVersion" (
    id text NOT NULL PRIMARY KEY,
    "reportId" text NOT NULL,
    "versionNumber" integer NOT NULL,
    event text NOT NULL,
    status text NOT NULL,
    "changedSections" text[] NOT NULL DEFAULT '{}',
    snapshot jsonb NOT NULL,
    validation jsonb NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "FinalReportVersion_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "FinalReport"(id) ON DELETE CASCADE,
    CONSTRAINT "FinalReportVersion_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "FinalReportVersion_report_version_key"
      UNIQUE ("reportId", "versionNumber")
);

CREATE INDEX IF NOT EXISTS "FinalReport_caseId_status_idx"
    ON "FinalReport" ("caseId", status);
CREATE INDEX IF NOT EXISTS "FinalReport_updatedAt_idx"
    ON "FinalReport" ("updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "FinalReportVersion_reportId_createdAt_idx"
    ON "FinalReportVersion" ("reportId", "createdAt" DESC);
