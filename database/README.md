# Database (Postgres)

The deployment target is **Supabase Postgres**. The backend talks to it with raw
`psycopg` over `DATABASE_URL` (no Supabase SDK, no RLS dependency), so any Postgres
reachable at that URL works for local dev too — including a local Docker Postgres.

## Env wiring

Put DB secrets only in `backend/.env`. See `backend/.env.example`. The frontend never
talks to Postgres directly — all data access goes through the FastAPI backend.

## Apply schema

**Apply `database/migrations/0003_prisma_compatible_schema.sql`**, then both
independent `0004_*` files (they share a number but are not alternatives):

- **`0004_hierarchy_auth.sql`** — ranks, `ltree` hierarchy, invitations, password-reset
  (use `backend/scripts/apply_0004.py` so enum `ADD VALUE` commits before insert)
- **`0004_chargesheet_draft.sql`** — adds `Case.chargesheetDraft` for OCR/draft APIs

Then **`database/migrations/0005_command_jurisdiction.sql`** (use
`backend/scripts/apply_0005.py`). 0005 adds IGP-level **`CommandRange`** (several
districts) and **`OfficerDistrict`** (DIG multi-district); the existing **`Range`**
table remains a DySP **subdivision** under a district — not an IGP range.
Finally apply **`database/migrations/0006_early_warning_notifications.sql`** for
hotspot-warning lifecycle fields and per-officer read state.
Then apply **`database/migrations/0007_case_diary_evidence.sql`** for case-diary,
evidence, document, custody-date, and investigating-officer support.
Apply **`database/migrations/0008_case_diary_indexes.sql`**, then
**`database/migrations/0009_case_custody_clocks.sql`**. Migration 0009 adds the
per-accused BNSS section 187(3) remand clock; it does not reuse the legacy
person-level custody date because that date is not FIR-specific.
Apply **`database/migrations/0010_final_report_builder.sql`** only to the isolated
development/test database while Phase 1 is being evaluated. It adds the
structured BNSS section 193 working report and immutable version history. The
original round-one database is intentionally unchanged.
Then apply **`database/migrations/0011_final_report_phase2_schema.sql`** to the
same isolated database. Migration 0011 keeps the exact legal snapshot in JSONB,
adds schema-v2 shape constraints, and indexes template profile, legal regime,
final-report number, current payload, and immutable version snapshots.
Then apply **`database/migrations/0012_case_report_sources.sql`** to that isolated
database. Migration 0012 adds reusable case-party profiles and chronology,
FIR-to-final legal decisions, property, expert results and evidence assessments.
These source records are revisioned separately from final-report versions so an
officer must explicitly refresh an editable draft; approved snapshots are never
rewritten.

`0001_initial_schema.sql` + `0002_rls_policies.sql` describe an earlier, unused design
(snake_case tables, Supabase-Auth-linked via `auth.users`/`auth.uid()`). The running
app authenticates with its own FastAPI JWT (badge ID + bcrypt), not Supabase Auth, so
0001/0002 don't apply — don't run them against the same database as 0003.

1. Create a Supabase project (or a local Postgres database for dev).
2. Run `database/migrations/0003_prisma_compatible_schema.sql`.
3. Run `backend/scripts/apply_0004.py` (or apply `0004_hierarchy_auth.sql` in two transactions).
4. Apply `database/migrations/0004_chargesheet_draft.sql`.
5. Run `backend/scripts/apply_0005.py` (or apply `0005_command_jurisdiction.sql`).
6. From `backend/`, run `python -m scripts.apply_0006` (or apply `0006_early_warning_notifications.sql`).
7. Apply `database/migrations/0007_case_diary_evidence.sql`.
8. Apply `database/migrations/0008_case_diary_indexes.sql`.
9. Apply `database/migrations/0009_case_custody_clocks.sql`.
10. From `backend/`, run `python -m scripts.apply_0010` against the isolated test
    database only.
11. From `backend/`, run `python -m scripts.apply_0011` against that same isolated
    test database only.
12. From `backend/`, run `python -m scripts.apply_0012` against that same isolated
    test database only.
13. Run `database/seed/seed.sql` for a demo-ready dataset (30 cases across ~6 months,
   a criminal network with a
   detectable ring) — or create demo officers by hand.
14. From `backend/`, run `python -m scripts.refresh_early_warnings` to backfill active warnings.
15. Fill `backend/.env` (`DATABASE_URL` + `SUPABASE_JWT_SECRET` at minimum; optional SMTP_*).

## Demo login (after seed + 0004)

| Badge ID | Password | Role |
|---|---|---|
| KA-IT-0001 | demo1234 | POLICE_IT |
| KA-CON-1001 | demo1234 | CONSTABLE |
| KA-INS-4471 | demo1234 | INSPECTOR (SHO-equivalent) |
| KA-SP-9999 | demo1234 | SP |

Auth today: FastAPI Badge ID (Service ID) login against the `Officer` table on Supabase Postgres (JWT signed with `SUPABASE_JWT_SECRET`). Accounts are invitation-based; temporary passwords force a change on first login.
