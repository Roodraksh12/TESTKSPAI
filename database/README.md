# Database (Supabase Postgres)

The target database is **Supabase Postgres** (not local Postgres, not Neon).

## Env wiring

Put Supabase/DB secrets only in `backend/.env`. Put public Supabase keys in `frontend/.env`. See those files' `.env.example` companions.

## Apply schema

1. Create a Supabase project.
2. In SQL Editor, run migrations under `database/migrations/` **or** recreate tables matching `database/schema.prisma` (PascalCase names if keeping existing Neon→Supabase data).
3. Run `database/seed/seed.sql` (or create demo officers).
4. Fill `backend/.env` and `frontend/.env`.

## Demo login (after seed)

| Badge ID | Password | Role |
|---|---|---|
| KA-CON-1001 | demo1234 | CONSTABLE |
| KA-INS-4471 | demo1234 | INSPECTOR |
| KA-SP-9999 | demo1234 | SP |

Auth today: FastAPI Badge ID login against the `Officer` table on Supabase Postgres (JWT signed with `SUPABASE_JWT_SECRET`).
