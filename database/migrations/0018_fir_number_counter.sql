-- Atomic, non-reusable FIR serial allocation for the isolated hackathon database.
-- The prototype keeps its existing globally unique FIR/YYYY/NNNN display format.

CREATE TABLE IF NOT EXISTS "FirNumberCounter" (
  "registerYear" integer PRIMARY KEY,
  "lastNumber" bigint NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "FirNumberCounter_lastNumber_check" CHECK ("lastNumber" >= 0)
);

-- Start above every numeric suffix already present for a year. This is safe for
-- legacy demo values such as FIR/2026/EXTRA-116 as well as FIR/2026/0003.
INSERT INTO "FirNumberCounter" ("registerYear", "lastNumber", "updatedAt")
SELECT
  EXTRACT(YEAR FROM c."reportedDate")::integer AS "registerYear",
  GREATEST(
    COALESCE(MAX(((regexp_match(c."firNumber", '([0-9]+)$'))[1])::bigint), 0),
    COUNT(*)::bigint
  ) AS "lastNumber",
  NOW()
FROM "Case" c
GROUP BY EXTRACT(YEAR FROM c."reportedDate")::integer
ON CONFLICT ("registerYear") DO UPDATE
SET "lastNumber" = GREATEST(
      "FirNumberCounter"."lastNumber",
      EXCLUDED."lastNumber"
    ),
    "updatedAt" = NOW();
