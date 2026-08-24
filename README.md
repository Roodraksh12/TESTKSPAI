# SCRB Sahayak — KSP Investigation Support Portal

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live_Demo-open-blue?style=for-the-badge)](https://kspai-zgymgiew.onslate.in/)
[![Demo Video](https://img.shields.io/badge/Demo_Video-YouTube-red?style=for-the-badge&logo=youtube)](https://youtu.be/_UJdQK79kRM)

![Status](https://img.shields.io/badge/status-test_build-orange)
![Frontend](https://img.shields.io/badge/frontend-React_18_%2B_Vite-blue)
![Backend](https://img.shields.io/badge/backend-FastAPI-teal)
![Database](https://img.shields.io/badge/database-PostgreSQL-336791)

</div>

SCRB Sahayak is a bilingual investigation-support prototype for police case
management, link analysis, statutory-deadline monitoring and officer-controlled
final-report preparation. It uses jurisdiction-scoped access and keeps formal
report generation deterministic: the final-report builder does not send case
content to an external AI service.

> The deployed demo may not update at the same time as the `main` branch. For
> the latest tested functionality, run the repository locally.

## Current test-build checkpoint

The current `main` branch includes:

- persistent, jurisdiction-scoped case directory and case dossiers;
- FIR/OCR intake and optional OpenRouter-assisted extraction/copilot workflows;
- date-wise case diary pages with per-day numbering and date-range PDF export;
- evidence and document linking with assigned-IO write controls;
- pan, zoom, drag and focus controls for dense cross-case network graphs;
- per-accused BNSS section 187(3) custody/remand clocks;
- a statutory deadline board that distinguishes remand clocks from FIR-age
  progress indicators;
- deterministic BNSS section 193 final-report working copies, validation,
  immutable versions, review/return/approval workflow and PDF export;
- reusable **Report Data** records for parties, accused chronology, legal-section
  decisions, property, expert results and evidence outcomes;
- hierarchy-aware RBAC, audit records, login throttling and stale-request fixes;
- command analytics, hotspots and early-warning indicators; and
- English/Kannada UI and speech support.

The former per-case Tactical View has been removed. Network investigation is
handled by the Network canvas.

## Important legal and data boundaries

This repository is a software prototype, not an authoritative legal filing
system or a substitute for an Investigating Officer, prosecutor or Court.

- A BNSS section 187(3) 60/90-day clock is recorded per accused and begins from
  the first Magistrate-authorised remand stored for that case. FIR registration
  alone does not start that custody clock.
- The 60- versus 90-day window must be chosen from the applicable alleged
  offence and punishment threshold and verified by the responsible officer.
- Final-report validation highlights missing or contradictory data; it does not
  decide guilt, select sections automatically or certify legal compliance.
- The current report template profile uses supplied Rajasthan IIF-IV material as
  a development reference. It is not represented as a notified Karnataka form.
- The Network canvas searches only data present in this test database. It is not
  connected to CCTNS, ICJS or a production police/criminal database.
- Do not put real operational or personally sensitive police data into the demo
  environment.

## Main workflows

### Case diary

Entries are grouped by the Karnataka calendar date. Page numbering restarts for
each day: two entries on 24 August are pages 1 and 2, while the first entry on
23 August is page 1 for that date. PDF export accepts a date range and produces
entries in chronological, per-day page order.

### Network analysis

The Network canvas supports:

- wheel/trackpad zoom;
- canvas panning;
- draggable nodes;
- fit-to-view and reset controls;
- search and focused exploration;
- key-player and detected-cluster panels; and
- jurisdiction-scoped source records.

Graph links are investigative leads and require human verification.

### Custody and deadline tracking

The custody clock is attached to a case-person record, not to a global person
record. An officer records:

- the first authorised remand date/time;
- the 60- or 90-day window;
- the legal basis and relevant section details;
- the remand order reference; and
- charge-sheet/final-report filing information when filed.

The deadline board separately displays FIR-age progress where relevant so it is
not mistaken for the default-bail clock.

### Deterministic final-report builder

1. Open a case and use **Report Data** to record reusable verified facts.
2. Open **FR – Final Report** and initialise a structured draft.
3. Use **Refresh case data** to fill empty fields from the saved case records.
4. Complete officer-authored allegations, section links, narratives and filing
   metadata.
5. Save to create an immutable version and resolve blocking validation issues.
6. Submit for supervisory review; a reviewer can return or approve the report.
7. Export the saved version to PDF.

Refreshing case data never overwrites a non-empty officer edit. It adds new
source-linked records, fills missing values and creates a `SOURCES_REFRESHED`
version. Approved reports are locked and are not rewritten.

## Architecture

```text
┌──────────────────────────────────┐
│ React + Vite + TypeScript SPA    │
│ Tailwind · Leaflet · Recharts    │
└────────────────┬─────────────────┘
                 │ REST + JWT
┌────────────────▼─────────────────┐
│ FastAPI backend                  │
│ RBAC · audit · OCR · PDF · TTS   │
│ deterministic report services   │
└────────────┬───────────┬─────────┘
             │           │ optional, selected workflows only
┌────────────▼──────┐  ┌─▼─────────────────┐
│ PostgreSQL        │  │ OpenRouter / TTS  │
│ Supabase or local │  │ copilot/intake    │
└───────────────────┘  └───────────────────┘
```

| Layer | Main technologies |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Leaflet, Recharts, Framer Motion |
| Backend | Python 3.11+, FastAPI, Pydantic, psycopg, JWT, bcrypt, PyMuPDF, ReportLab |
| Database | PostgreSQL/Supabase, including `ltree` for hierarchy paths |
| Optional AI | Configurable OpenRouter model for copilot/intake functions |
| Speech/OCR | Edge-TTS, Web Speech API, Tesseract OCR |

## Repository layout

```text
backend/                 FastAPI application, services, tests and migration helpers
database/                SQL migrations, Prisma reference schema and demo seed
docs/                    Final-report implementation notes
frontend/                React/Vite application
```

## Local setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL/Supabase connection
- Tesseract OCR if FIR image OCR is required

On macOS, OCR dependencies can be installed with:

```bash
brew install tesseract tesseract-lang
```

### 1. Clone and install the backend

```bash
git clone https://github.com/Roodraksh12/TESTKSPAI.git
cd TESTKSPAI/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Fill at least these backend values:

```dotenv
DATABASE_URL=postgresql://...
SUPABASE_JWT_SECRET=replace-with-a-long-random-secret
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

`OPENROUTER_API_KEY` is optional for deterministic case, deadline, network,
diary and final-report functionality. It is required only for the configured AI
workflows.

For this cloned development workspace, `backend/.env.test` can override `.env`:

```bash
cp .env.example .env.test
```

Both files are ignored by Git. Never commit database passwords, JWT secrets,
service-role keys or police data.

### 2. Prepare the database

Use a separate development/test project. Do not run experimental migrations
against the original shared round-one database.

The canonical order and base-schema notes are in
[`database/README.md`](database/README.md). The active schema progresses through:

```text
0003
0004 hierarchy/auth + chargesheet draft
0005
0006
0007
0008
0009 custody clocks
0010 final-report builder
0011 final-report schema v2
0012 reusable case report sources
```

For a test database that already has migrations through 0008, run from
`backend/`:

```bash
PYTHONPATH=. python -m scripts.apply_0009
PYTHONPATH=. python -m scripts.apply_0010
PYTHONPATH=. python -m scripts.apply_0011
PYTHONPATH=. python -m scripts.apply_0012
```

Migrations 0010–0012 are currently intended for the isolated development/test
database while the reporting workflow is reviewed.

### 3. Run the backend

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health endpoint: [http://localhost:8000/health](http://localhost:8000/health)

### 4. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend uses:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
```

Open [http://localhost:5173](http://localhost:5173).

## Demo seed accounts

After loading [`database/seed/seed.sql`](database/seed/seed.sql), the default
development accounts are:

| Role | Badge ID | Seed password | Scope |
|---|---|---|---|
| Police IT | `KA-IT-0001` | `demo1234` | Administration/bootstrap |
| SP | `KA-SP-9999` | `demo1234` | District command |
| Inspector | `KA-INS-4471` | `demo1234` | Station/IO workflows |
| Constable | `KA-CON-1001` | `demo1234` | Station-scoped case access |

Change demo passwords for any persistent environment.

## Testing and verification

Backend tests use the database configured in `backend/.env.test` when present.
Confirm that it points to an isolated test database before running integration
tests.

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. pytest -q
```

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

The checkpoint pushed on 24 August 2026 passed 128 backend tests, frontend lint,
the production build and a reversible report-source → final-report refresh smoke
test.

## Working together safely

Before starting work:

```bash
git switch main
git pull origin main
git switch -c feature/short-description
```

After testing:

```bash
git add <files-you-intend-to-commit>
git commit -m "feat: describe the change"
git push -u origin feature/short-description
```

Open a pull request, review the diff and test results, then merge. Avoid editing
the same files directly on `main` from two machines at the same time.

## Additional documentation

- [Database and migration guide](database/README.md)
- [Final-report Phase 2](docs/final-report-phase2.md)
- [Final-report Phase 3](docs/final-report-phase3.md)

## License and attribution

Add the intended project licence before production distribution. Map tiles and
other third-party services remain subject to their respective terms.
