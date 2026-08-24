-- Phase 3: reusable, case-level investigation records for deterministic reports.
-- Apply only to the isolated development/test database until the workflow has
-- been reviewed by the intended police/legal users.

CREATE TABLE IF NOT EXISTS "CaseReportSourceState" (
    "caseId" text NOT NULL PRIMARY KEY,
    revision integer NOT NULL DEFAULT 0,
    "createdById" text NOT NULL,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseReportSourceState_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CaseReportSourceState_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseReportSourceState_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseReportSourceState_revision_check" CHECK (revision >= 0)
);

CREATE TABLE IF NOT EXISTS "CasePartyProfile" (
    "casePersonId" text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    "isComplainant" boolean NOT NULL DEFAULT false,
    alias text,
    "parentName" text,
    "birthYear" integer,
    gender text,
    nationality text,
    occupation text,
    "permanentAddress" text,
    "identityStatus" text NOT NULL DEFAULT 'NOT_RECORDED',
    "identityType" text,
    "identityReference" text,
    "verificationNotes" text,
    "relationshipToVictim" text,
    "injuryOrLoss" text,
    "statementSummary" text,
    "evidenceType" text NOT NULL DEFAULT 'ORAL',
    disposition text NOT NULL DEFAULT 'NOT_RECORDED',
    "dispositionReason" text,
    "bailStatus" text NOT NULL DEFAULT 'NOT_RECORDED',
    "regularCriminalNumber" text,
    "previousConvictions" text,
    "suretyDetails" text,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CasePartyProfile_casePersonId_fkey"
      FOREIGN KEY ("casePersonId") REFERENCES "CasePerson"(id) ON DELETE CASCADE,
    CONSTRAINT "CasePartyProfile_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CasePartyProfile_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CasePartyProfile_birthYear_check" CHECK (
      "birthYear" IS NULL OR "birthYear" BETWEEN 1800 AND 2200
    ),
    CONSTRAINT "CasePartyProfile_identityStatus_check" CHECK (
      "identityStatus" IN ('NOT_RECORDED', 'PENDING', 'VERIFIED', 'UNVERIFIED')
    ),
    CONSTRAINT "CasePartyProfile_disposition_check" CHECK (
      disposition IN ('NOT_RECORDED', 'CHARGE_SHEETED', 'NOT_CHARGE_SHEETED')
    )
);
CREATE INDEX IF NOT EXISTS "CasePartyProfile_caseId_idx"
  ON "CasePartyProfile" ("caseId");
CREATE UNIQUE INDEX IF NOT EXISTS "CasePartyProfile_one_complainant_idx"
  ON "CasePartyProfile" ("caseId") WHERE "isComplainant";

CREATE TABLE IF NOT EXISTS "CasePartyEvent" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    "casePersonId" text NOT NULL,
    "eventType" text NOT NULL,
    "occurredAt" timestamp(3) without time zone NOT NULL,
    reference text,
    notes text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CasePartyEvent_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CasePartyEvent_casePersonId_fkey"
      FOREIGN KEY ("casePersonId") REFERENCES "CasePerson"(id) ON DELETE CASCADE,
    CONSTRAINT "CasePartyEvent_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CasePartyEvent_eventType_check" CHECK (
      "eventType" IN (
        'IDENTIFIED', 'ARRESTED', 'FORWARDED_TO_COURT', 'BAIL_GRANTED',
        'RELEASED_ON_BAIL', 'ABSCONDING', 'SURRENDERED', 'OTHER'
      )
    )
);
CREATE INDEX IF NOT EXISTS "CasePartyEvent_case_person_time_idx"
  ON "CasePartyEvent" ("caseId", "casePersonId", "occurredAt");

CREATE TABLE IF NOT EXISTS "CaseLegalSection" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    "catalogId" text,
    "actCode" text NOT NULL,
    "sectionNumber" text NOT NULL,
    title text NOT NULL,
    punishment text,
    "conditionNote" text,
    "initiallyAlleged" boolean NOT NULL DEFAULT false,
    "finalDecision" text NOT NULL DEFAULT 'NOT_RECORDED',
    "decisionReason" text,
    "approvalReference" text,
    "createdById" text NOT NULL,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseLegalSection_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CaseLegalSection_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseLegalSection_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseLegalSection_finalDecision_check" CHECK (
      "finalDecision" IN ('NOT_RECORDED', 'RETAINED', 'ADDED', 'DROPPED')
    ),
    CONSTRAINT "CaseLegalSection_case_act_section_key"
      UNIQUE ("caseId", "actCode", "sectionNumber")
);
CREATE INDEX IF NOT EXISTS "CaseLegalSection_caseId_idx"
  ON "CaseLegalSection" ("caseId");

CREATE TABLE IF NOT EXISTS "CasePropertyItem" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    "sourceEvidenceId" text,
    category text NOT NULL DEFAULT 'OTHER',
    description text NOT NULL,
    quantity text,
    "estimatedValue" text,
    "recoveryStatus" text NOT NULL DEFAULT 'NOT_RECORDED',
    "recoveredAt" timestamp(3) without time zone,
    "seizureMemoReference" text,
    "disposalStatus" text NOT NULL DEFAULT 'NOT_RECORDED',
    "createdById" text NOT NULL,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CasePropertyItem_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CasePropertyItem_sourceEvidenceId_fkey"
      FOREIGN KEY ("sourceEvidenceId") REFERENCES "Evidence"(id) ON DELETE SET NULL,
    CONSTRAINT "CasePropertyItem_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CasePropertyItem_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "CasePropertyItem_caseId_idx"
  ON "CasePropertyItem" ("caseId");

CREATE TABLE IF NOT EXISTS "CaseExpertResult" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    "sourceDocumentId" text,
    type text NOT NULL DEFAULT 'OTHER',
    status text NOT NULL DEFAULT 'NOT_RECORDED',
    "referenceNumber" text,
    "resultDate" date,
    summary text,
    "createdById" text NOT NULL,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseExpertResult_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CaseExpertResult_sourceDocumentId_fkey"
      FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"(id) ON DELETE SET NULL,
    CONSTRAINT "CaseExpertResult_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseExpertResult_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseExpertResult_status_check" CHECK (
      status IN ('NOT_RECORDED', 'PENDING', 'RECEIVED', 'NOT_APPLICABLE')
    )
);
CREATE INDEX IF NOT EXISTS "CaseExpertResult_caseId_idx"
  ON "CaseExpertResult" ("caseId");

CREATE TABLE IF NOT EXISTS "EvidenceAssessment" (
    "evidenceId" text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    "resultStatus" text NOT NULL DEFAULT 'NOT_RECORDED',
    "resultSummary" text,
    "referenceNumber" text,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceAssessment_evidenceId_fkey"
      FOREIGN KEY ("evidenceId") REFERENCES "Evidence"(id) ON DELETE CASCADE,
    CONSTRAINT "EvidenceAssessment_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "EvidenceAssessment_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "EvidenceAssessment_resultStatus_check" CHECK (
      "resultStatus" IN ('NOT_RECORDED', 'PENDING', 'RECEIVED', 'NOT_APPLICABLE')
    )
);
CREATE INDEX IF NOT EXISTS "EvidenceAssessment_caseId_idx"
  ON "EvidenceAssessment" ("caseId");
