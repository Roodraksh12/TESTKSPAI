-- Provisional investigation-playbook framework for the isolated test database.
-- The stored sourceStatus/profile metadata prevents demo workflows from being
-- represented as official departmental procedure or document formats.

CREATE TABLE IF NOT EXISTS "CaseInvestigationPlan" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL UNIQUE,
    "profileCode" text NOT NULL,
    "profileVersion" integer NOT NULL,
    "profileTitle" text NOT NULL,
    "sourceStatus" text NOT NULL,
    disclaimer text NOT NULL,
    "createdById" text NOT NULL,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseInvestigationPlan_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CaseInvestigationPlan_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseInvestigationPlan_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseInvestigationPlan_profileVersion_check" CHECK ("profileVersion" > 0),
    CONSTRAINT "CaseInvestigationPlan_sourceStatus_check" CHECK (
      "sourceStatus" IN ('PROVISIONAL_DEMO', 'DEPARTMENT_REVIEWED', 'OFFICIAL')
    )
);

CREATE TABLE IF NOT EXISTS "CaseInvestigationTask" (
    id text NOT NULL PRIMARY KEY,
    "planId" text NOT NULL,
    "caseId" text NOT NULL,
    "taskKey" text NOT NULL,
    phase text NOT NULL,
    title text NOT NULL,
    guidance text NOT NULL,
    rationale text,
    "sortOrder" integer NOT NULL,
    status text NOT NULL DEFAULT 'PENDING',
    "officerNotes" text,
    "documentTemplateKey" text,
    "completedAt" timestamp(3) without time zone,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseInvestigationTask_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "CaseInvestigationPlan"(id) ON DELETE CASCADE,
    CONSTRAINT "CaseInvestigationTask_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CaseInvestigationTask_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "CaseInvestigationTask_sortOrder_check" CHECK ("sortOrder" >= 0),
    CONSTRAINT "CaseInvestigationTask_status_check" CHECK (
      status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'NOT_APPLICABLE')
    ),
    CONSTRAINT "CaseInvestigationTask_plan_task_key" UNIQUE ("planId", "taskKey"),
    CONSTRAINT "CaseInvestigationTask_id_case_key" UNIQUE (id, "caseId")
);

CREATE TABLE IF NOT EXISTS "RoutineDocumentDraft" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    "taskId" text,
    "templateKey" text NOT NULL,
    "templateVersion" integer NOT NULL,
    "sourceStatus" text NOT NULL,
    title text NOT NULL,
    language text NOT NULL DEFAULT 'en',
    content text NOT NULL,
    "inputData" jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'DRAFT',
    "createdById" text NOT NULL,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoutineDocumentDraft_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "RoutineDocumentDraft_task_case_fkey"
      FOREIGN KEY ("taskId", "caseId")
      REFERENCES "CaseInvestigationTask"(id, "caseId") ON DELETE CASCADE,
    CONSTRAINT "RoutineDocumentDraft_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "RoutineDocumentDraft_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "Officer"(id) ON DELETE RESTRICT,
    CONSTRAINT "RoutineDocumentDraft_templateVersion_check" CHECK ("templateVersion" > 0),
    CONSTRAINT "RoutineDocumentDraft_sourceStatus_check" CHECK (
      "sourceStatus" IN ('PROVISIONAL_DEMO', 'DEPARTMENT_REVIEWED', 'OFFICIAL')
    ),
    CONSTRAINT "RoutineDocumentDraft_status_check" CHECK (status IN ('DRAFT', 'ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS "CaseInvestigationTask_case_status_order_idx"
  ON "CaseInvestigationTask" ("caseId", status, "sortOrder");
CREATE INDEX IF NOT EXISTS "RoutineDocumentDraft_case_updated_idx"
  ON "RoutineDocumentDraft" ("caseId", "updatedAt" DESC);

-- Keep repeated application safe for a test database where an earlier draft of
-- this migration may already have created the tables.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RoutineDocumentDraft_taskId_fkey'
  ) THEN
    ALTER TABLE "RoutineDocumentDraft"
      DROP CONSTRAINT "RoutineDocumentDraft_taskId_fkey";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CaseInvestigationTask_id_case_key'
  ) THEN
    ALTER TABLE "CaseInvestigationTask"
      ADD CONSTRAINT "CaseInvestigationTask_id_case_key" UNIQUE (id, "caseId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RoutineDocumentDraft_task_case_fkey'
  ) THEN
    ALTER TABLE "RoutineDocumentDraft"
      ADD CONSTRAINT "RoutineDocumentDraft_task_case_fkey"
      FOREIGN KEY ("taskId", "caseId")
      REFERENCES "CaseInvestigationTask"(id, "caseId") ON DELETE CASCADE;
  END IF;
END $$;
