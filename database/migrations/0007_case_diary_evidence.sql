-- database/migrations/0007_case_diary_evidence.sql

-- 1. Create EvidenceType Enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EvidenceType') THEN
        CREATE TYPE "EvidenceType" AS ENUM ('PHOTO', 'VIDEO', 'VOICE', 'FORENSIC', 'MISC');
    END IF;
END$$;

-- 2. Add currentIoId to Case
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "currentIoId" text;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Case_currentIoId_fkey'
    ) THEN
        ALTER TABLE "Case"
        ADD CONSTRAINT "Case_currentIoId_fkey"
        FOREIGN KEY ("currentIoId") REFERENCES "Officer"(id) ON DELETE SET NULL;
    END IF;
END$$;

-- 3. Add custodyStartDate to Person
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "custodyStartDate" timestamp(3) without time zone;

-- 4. Create CaseDiaryEntry table
CREATE TABLE IF NOT EXISTS "CaseDiaryEntry" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    "pageNumber" integer NOT NULL,
    "authorId" text NOT NULL,
    "activityType" text NOT NULL,
    narrative text NOT NULL,
    timestamp timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CaseDiaryEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "CaseDiaryEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Officer"(id) ON DELETE RESTRICT
);

-- 5. Create Evidence table
CREATE TABLE IF NOT EXISTS "Evidence" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    type "EvidenceType" NOT NULL,
    description text NOT NULL,
    "addedById" text NOT NULL,
    status text DEFAULT 'ACTIVE' NOT NULL,
    timestamp timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Evidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "Evidence_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "Officer"(id) ON DELETE RESTRICT
);

-- 6. Create Document table
CREATE TABLE IF NOT EXISTS "Document" (
    id text NOT NULL PRIMARY KEY,
    "caseId" text NOT NULL,
    name text NOT NULL,
    path text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "diaryEntryId" text,
    "evidenceId" text,
    CONSTRAINT "Document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"(id) ON DELETE CASCADE,
    CONSTRAINT "Document_diaryEntryId_fkey" FOREIGN KEY ("diaryEntryId") REFERENCES "CaseDiaryEntry"(id) ON DELETE SET NULL,
    CONSTRAINT "Document_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"(id) ON DELETE SET NULL
);

-- 7. Create junction tables for DiaryEntry-Evidence, DiaryEntry-Person, Evidence-Person
CREATE TABLE IF NOT EXISTS "DiaryEntryEvidence" (
    "diaryEntryId" text NOT NULL,
    "evidenceId" text NOT NULL,
    CONSTRAINT "DiaryEntryEvidence_pkey" PRIMARY KEY ("diaryEntryId", "evidenceId"),
    CONSTRAINT "DiaryEntryEvidence_diaryEntryId_fkey" FOREIGN KEY ("diaryEntryId") REFERENCES "CaseDiaryEntry"(id) ON DELETE CASCADE,
    CONSTRAINT "DiaryEntryEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "DiaryEntryPerson" (
    "diaryEntryId" text NOT NULL,
    "personId" text NOT NULL,
    CONSTRAINT "DiaryEntryPerson_pkey" PRIMARY KEY ("diaryEntryId", "personId"),
    CONSTRAINT "DiaryEntryPerson_diaryEntryId_fkey" FOREIGN KEY ("diaryEntryId") REFERENCES "CaseDiaryEntry"(id) ON DELETE CASCADE,
    CONSTRAINT "DiaryEntryPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "EvidencePerson" (
    "evidenceId" text NOT NULL,
    "personId" text NOT NULL,
    CONSTRAINT "EvidencePerson_pkey" PRIMARY KEY ("evidenceId", "personId"),
    CONSTRAINT "EvidencePerson_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"(id) ON DELETE CASCADE,
    CONSTRAINT "EvidencePerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"(id) ON DELETE CASCADE
);
