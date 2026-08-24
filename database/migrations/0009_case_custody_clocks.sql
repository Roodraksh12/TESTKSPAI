-- Per-accused BNSS section 187(3) custody/remand clocks.
--
-- The statutory 60/90-day period is tied to the accused's first remand into
-- custody for this FIR, not the FIR registration date or the date a suspect is
-- identified. A Person can appear in more than one FIR, so this is tied to
-- CasePerson rather than Person.custodyStartDate.

CREATE TABLE IF NOT EXISTS "CaseCustodyClock" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    "casePersonId" text NOT NULL,
    "firstRemandAt" timestamp(3) without time zone NOT NULL,
    "windowDays" integer NOT NULL,
    "thresholdBasis" text NOT NULL,
    "legalSectionDetails" text NOT NULL,
    "remandOrderReference" text NOT NULL,
    notes text,
    "reportFiledAt" timestamp(3) without time zone,
    "reportReference" text,
    "createdById" text NOT NULL,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CaseCustodyClock_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CaseCustodyClock_casePersonId_fkey"
      FOREIGN KEY ("casePersonId") REFERENCES "CasePerson"(id) ON DELETE CASCADE,
    CONSTRAINT "CaseCustodyClock_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseCustodyClock_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseCustodyClock_casePersonId_key" UNIQUE ("casePersonId"),
    CONSTRAINT "CaseCustodyClock_windowDays_check" CHECK ("windowDays" IN (60, 90)),
    CONSTRAINT "CaseCustodyClock_threshold_check" CHECK (
      ("windowDays" = 90 AND "thresholdBasis" = 'DEATH_LIFE_OR_TEN_YEARS_OR_MORE')
      OR ("windowDays" = 60 AND "thresholdBasis" = 'OTHER_OFFENCE')
    ),
    CONSTRAINT "CaseCustodyClock_report_reference_check" CHECK (
      ("reportFiledAt" IS NULL AND "reportReference" IS NULL)
      OR ("reportFiledAt" IS NOT NULL AND "reportReference" IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS "CaseCustodyClock_caseId_firstRemandAt_idx"
    ON "CaseCustodyClock" ("caseId", "firstRemandAt");
CREATE INDEX IF NOT EXISTS "CaseCustodyClock_active_caseId_idx"
    ON "CaseCustodyClock" ("caseId")
    WHERE "reportFiledAt" IS NULL;
