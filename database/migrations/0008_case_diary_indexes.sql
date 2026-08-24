-- Read-path indexes for the case dossier, PDF export, and global search.
-- Kept separate because 0007 may already be applied in shared environments.

CREATE INDEX IF NOT EXISTS "CaseDiaryEntry_caseId_timestamp_idx"
    ON "CaseDiaryEntry" ("caseId", timestamp DESC);
CREATE INDEX IF NOT EXISTS "Evidence_caseId_timestamp_idx"
    ON "Evidence" ("caseId", timestamp DESC);
CREATE INDEX IF NOT EXISTS "Document_caseId_idx" ON "Document" ("caseId");
CREATE INDEX IF NOT EXISTS "Document_diaryEntryId_idx" ON "Document" ("diaryEntryId");
CREATE INDEX IF NOT EXISTS "Document_evidenceId_idx" ON "Document" ("evidenceId");
