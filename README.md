# SCRB Sahayak (KSP Portal)

| Folder | Role |
|--------|------|
| `frontend/` | React 18 + Vite + Tailwind |
| `backend/` | FastAPI + Supabase Postgres + OpenRouter |
| `database/` | Supabase schema, migrations, seed |

## Prerequisites

- Node.js 18+
- Python 3.11+
- A **Supabase** project (Postgres + API keys)
- Tesseract OCR on the machine for FIR image upload (optional if you only use Magic Draft)

## Environment

Only **two** env files are used (no root `.env`):

| File | Loaded by |
|------|-----------|
| `backend/.env` | FastAPI |
| `frontend/.env` | Vite |

Copy from `backend/.env.example` and `frontend/.env.example`, then fill values. Never put OpenRouter, service-role, JWT secret, or `DATABASE_URL` in `frontend/`.

## Run locally

### 1. Database (Supabase)

Apply SQL in `database/migrations/` (or recreate tables from `database/schema.prisma`), then seed from `database/seed/`.

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health: http://localhost:8000/health

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173

## Demo login (after seed on Supabase)

| Badge ID | Password |
|----------|----------|
| `KA-INS-4471` | `demo1234` |
| `KA-CON-1001` | `demo1234` |
| `KA-SP-9999` | `demo1234` |

## Wiring

```text
Browser (Vite :5173)
  ├─ Google Maps JS     (VITE_GOOGLE_MAPS_API_KEY)
  ├─ Supabase public    (VITE_SUPABASE_URL + anon key)
  └─ REST + Bearer JWT  →  FastAPI (:8000)
                              ├─ Supabase Postgres (DATABASE_URL)
                              └─ OpenRouter (OPENROUTER_API_KEY)
```

Auth: Badge ID + password → `POST /api/auth/login` → JWT signed with `SUPABASE_JWT_SECRET`.

## Migration notes

See [MIGRATION_NOTES.md](./MIGRATION_NOTES.md).
