-- Seed-first network traversal indexes for the isolated hackathon/test database.
-- These support bounded neighbourhood lookup from an explicitly selected case.

CREATE INDEX IF NOT EXISTS "CasePerson_person_case_idx"
  ON "CasePerson" ("personId", "caseId");

CREATE INDEX IF NOT EXISTS "CaseMatch_case_active_idx"
  ON "CaseMatch" ("caseId", status)
  WHERE status != 'REJECTED';

CREATE INDEX IF NOT EXISTS "CaseMatch_matched_case_active_idx"
  ON "CaseMatch" ("matchedCaseId", status)
  WHERE "matchedCaseId" IS NOT NULL AND status != 'REJECTED';

CREATE INDEX IF NOT EXISTS "CaseMatch_matched_person_active_idx"
  ON "CaseMatch" ("matchedPersonId", status)
  WHERE "matchedPersonId" IS NOT NULL AND status != 'REJECTED';

CREATE INDEX IF NOT EXISTS "Connection_person_a_idx"
  ON "Connection" ("personAId");

CREATE INDEX IF NOT EXISTS "Connection_person_b_idx"
  ON "Connection" ("personBId");
