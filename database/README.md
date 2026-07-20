# Database (Postgres)

The deployment target is **Supabase Postgres**. The backend talks to it with raw
`psycopg` over `DATABASE_URL` (no Supabase SDK, no RLS dependency), so any Postgres
reachable at that URL works for local dev too — including a local Docker Postgres.

## Env wiring

Put DB secrets only in `backend/.env`. See `backend/.env.example`. The frontend never
talks to Postgres directly — all data access goes through the FastAPI backend.

## Apply schema

**Apply `database/migrations/0003_prisma_compatible_schema.sql`** — it's the schema
the backend actually queries against (PascalCase quoted tables: `"Case"`,
`"CasePerson"`, etc.), and the one `database/seed/seed.sql` and
`backend/scripts/seed_supabase.py` both target.

`0001_initial_schema.sql` + `0002_rls_policies.sql` describe an earlier, unused design
(snake_case tables, Supabase-Auth-linked via `auth.users`/`auth.uid()`). The running
app authenticates with its own FastAPI JWT (badge ID + bcrypt), not Supabase Auth, so
0001/0002 don't apply — don't run them against the same database as 0003.

1. Create a Supabase project (or a local Postgres database for dev).
2. Run `database/migrations/0003_prisma_compatible_schema.sql`.
3. Run `database/seed/seed.sql` for a demo-ready dataset (30 cases across ~6 months,
   several overdue on the statutory deadline clock, a criminal network with a
   detectable ring) — or create demo officers by hand.
4. Fill `backend/.env` (`DATABASE_URL` + `SUPABASE_JWT_SECRET` at minimum).

## Demo login (after seed)

| Badge ID | Password | Role |
|---|---|---|
| KA-CON-1001 | demo1234 | CONSTABLE |
| KA-INS-4471 | demo1234 | INSPECTOR |
| KA-SP-9999 | demo1234 | SP |

Auth today: FastAPI Badge ID login against the `Officer` table on Supabase Postgres (JWT signed with `SUPABASE_JWT_SECRET`).
