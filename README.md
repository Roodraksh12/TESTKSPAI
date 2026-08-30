# SCRB Sahayak — KSP Investigation Support Portal

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live_Demo-open-blue?style=for-the-badge)](https://kspai-zgymgiew.onslate.in/)
[![Demo Video](https://img.shields.io/badge/Demo_Video-YouTube-red?style=for-the-badge&logo=youtube)](https://youtu.be/_UJdQK79kRM)

![Status](https://img.shields.io/badge/status-hackathon_demo-orange)
![Frontend](https://img.shields.io/badge/frontend-React_18_%2B_Vite-blue)
![Backend](https://img.shields.io/badge/backend-FastAPI-teal)
![Database](https://img.shields.io/badge/database-PostgreSQL-336791)

</div>

**SCRB Sahayak v2** is a bilingual investigation-support platform designed for modern police case management. It features advanced link analysis, statutory-deadline monitoring, and officer-controlled final-report preparation. It enforces jurisdiction-scoped access and keeps formal report generation deterministic (meaning the final-report builder never sends sensitive case content to external AI services).

> **Demo boundary:** this is a hackathon prototype using synthetic test data. It
> is not an official KSP system and is not connected to CCTNS, ICJS or a
> production police/criminal database.

### 🚀 Quick Links
- **Live Deployment:** [https://kspai-zgymgiew.onslate.in/](https://kspai-zgymgiew.onslate.in/)
- **Video Walkthrough:** [Watch on YouTube](https://youtu.be/_UJdQK79kRM)

> The deployed demo may not update at the exact same time as the `main` branch. For the absolute latest bleeding-edge functionality, run the repository locally.

## Current test-build checkpoint

The working test build described by this checkout includes:

- persistent, jurisdiction-scoped case directory and case dossiers;
- FIR/OCR intake and optional OpenRouter-assisted extraction/copilot workflows;
- protected original-FIR retention with jurisdiction-checked viewing, downloads,
  audit events and an OCR-only fallback for older cases;
- distinct person records on intake, with no name-only merging and only
  corroborated, officer-reviewable identity leads;
- atomic, database-controlled yearly FIR serial allocation that cannot issue the
  same number to two simultaneous case creations;
- date-wise case diary pages with per-day numbering and date-range PDF export;
- evidence and document linking with assigned-IO write controls and
  database-backed diary attachments for the test deployment;
- pan, zoom, drag and focus controls for dense cross-case network graphs;
- per-accused BNSS section 187(3) custody/remand clocks;
- a statutory deadline board that distinguishes remand clocks from FIR-age
  progress indicators;
- deterministic BNSS section 193 final-report working copies, validation,
  immutable versions, review/return/approval workflow and PDF export;
- reusable **Report Data** records for parties, accused chronology, legal-section
  decisions, property, expert results and evidence outcomes;
- versioned per-case **Investigation Plans** with assigned-IO task status, notes,
  audit records and deterministic routine-document demo drafts;
- hierarchy-aware RBAC, audit records, login throttling and stale-request fixes;
- jurisdiction-scoped conversational case search and verified crime-statistics
  breakdowns by crime, status, station, district, month, weekday or hour;
- a provider-neutral AI gateway with backend-only sensitive-data tokenisation,
  default-on per-request Zero Data Retention enforcement for OpenRouter,
  private-model routing, read-only AI tools and metadata-only privacy audit
  records;
- command analytics, hotspots and early-warning indicators; and
- English/Kannada UI and speech support.

Frontend routes are loaded on demand, and FIR queue state/results are shared in
the test database so a browser reload or a different backend process does not
erase the visible job record. A backend interruption may still require the
officer to retry processing; production deployment needs a managed worker queue.

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
- The investigation-plan registry and routine-document templates are explicitly
  marked `PROVISIONAL_DEMO`. They are not Karnataka Police procedures, standing
  orders or departmental forms and cannot be filed or transmitted by the app.
- The Network canvas searches only data present in this test database. It is not
  connected to CCTNS, ICJS or a production police/criminal database.
- The external-AI privacy layer reduces exposure; rule-based redaction cannot
  guarantee that every sensitive phrase in arbitrary text will be detected.
- Do not put real operational or personally sensitive police data into the demo
  environment. A production police deployment still requires departmental
  approval, security review and an approved private processing boundary.

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
- seed-first case neighbourhoods, so a dossier always opens its own bounded
  evidence-linked graph even when it is older than the recent network window;
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

### Provisional investigation plans

1. Open a case and select **Investigation Plan**.
2. The assigned IO can initialise a versioned checklist selected from the case's
   recorded crime type.
3. Record each task as pending, in progress, completed, blocked or not applicable,
   with an officer note where needed.
4. Create an editable routine-document draft from verified case metadata plus
   officer-entered decision fields.
5. Review and edit the text outside any filing workflow. The demo never signs,
   approves, files or transmits the draft.

The starter registry lives in
`backend/app/data/investigation_playbooks.demo.json`. When a competent department
provides approved workflows and formats, add a reviewed version rather than
silently changing the snapshot already attached to existing cases.

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
┌────────────▼──────┐  ┌─▼────────────────────┐
│ PostgreSQL        │  │ AI provider gateway  │
│ Supabase or local │  │ private/API + TTS    │
└───────────────────┘  └──────────────────────┘
```

| Layer | Main technologies |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Leaflet, Recharts, Framer Motion |
| Backend | Python 3.11+, FastAPI, Pydantic, psycopg, JWT, bcrypt, PyMuPDF, ReportLab |
| Database | PostgreSQL/Supabase, including `ltree` for hierarchy paths |
| Optional AI | Configurable OpenRouter or private OpenAI-compatible endpoint |
| Speech/OCR | Edge-TTS, Web Speech API, Tesseract OCR |

## Repository layout

```text
backend/                 FastAPI application, services, tests and migration helpers
database/                Canonical SQL migrations and synthetic demo seed
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

AI calls use a provider gateway. The existing OpenRouter setup remains the
default and continues to use `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`:

```dotenv
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openrouter/free
OPENROUTER_ZDR_REQUIRED=true
AI_EXTERNAL_MODE=redacted_only
```

OpenRouter requests are tokenised on the backend. With the default
`OPENROUTER_ZDR_REQUIRED=true`, they also include `provider.zdr=true`. The
configured model therefore needs a current, tool-capable Zero Data Retention
endpoint. Free endpoint availability is not guaranteed; an incompatible or
rate-limited route fails closed instead of falling back to a provider with
weaker retention. Check the current endpoint list at
[OpenRouter's ZDR endpoint](https://openrouter.ai/api/v1/endpoints/zdr).

For a synthetic-data-only hackathon demo, ZDR routing can be temporarily paused
with `OPENROUTER_ZDR_REQUIRED=false`. Redaction and privacy audit metadata remain
active, but the external provider's ordinary retention policy then applies. Do
not use that mode with real police, personal, or sensitive case data.

To use a private or self-hosted API that implements the OpenAI-compatible chat
completions contract, switch only the backend configuration:

```dotenv
AI_PROVIDER=openai_compatible
AI_BASE_URL=http://your-private-ai-host:port/v1
AI_MODEL=your-deployed-model
AI_API_KEY=
AI_PRIVATE_ENDPOINT=true
```

`AI_API_KEY` may be left empty only when the private endpoint does not require
authentication. `AI_PRIVATE_ENDPOINT=true` is an explicit trust declaration and
must never be set for an ordinary third-party endpoint. `AI_REQUEST_TIMEOUT_SECONDS`
defaults to `90`. OpenRouter or private AI configuration is optional for
deterministic case, deadline, network, diary and final-report functionality; it
is required only for AI workflows.

Additional privacy controls are documented in
[`docs/implementation-change-report.md`](docs/implementation-change-report.md).
The default local chat-history retention window is 30 days. Preview the purge
before applying it:

```bash
cd backend
PYTHONPATH=. python -m scripts.purge_ai_history
PYTHONPATH=. python -m scripts.purge_ai_history --apply
```

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
0013 provisional investigation plans and routine-document drafts
0014 AI request privacy audit metadata and chat privacy metadata
0015 scalable case-directory indexes
0016 protected original-FIR documents
0017 seed-first network-focus indexes
0018 atomic FIR-number counter
0019 durable FIR-job and diary-document storage
```

For a test database that already has migrations through 0008, run from
`backend/`:

```bash
PYTHONPATH=. python -m scripts.apply_0009
PYTHONPATH=. python -m scripts.apply_0010
PYTHONPATH=. python -m scripts.apply_0011
PYTHONPATH=. python -m scripts.apply_0012
PYTHONPATH=. python -m scripts.apply_0013
PYTHONPATH=. python -m scripts.apply_0014
PYTHONPATH=. python -m scripts.apply_0015
PYTHONPATH=. python -m scripts.apply_0016
PYTHONPATH=. python -m scripts.apply_0017
PYTHONPATH=. python -m scripts.apply_0018
PYTHONPATH=. python -m scripts.apply_0019
```

Migrations 0010–0019 are currently intended for the isolated development/test
database while the reporting, playbook and document-retention workflows are reviewed.

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
npm run typecheck
npm test
npm run build
```

The latest local checkpoint passed the backend suite plus frontend route/state
tests, lint, type checking and the production build. The privacy gateway also
passed isolated tokenisation, ZDR,
private-endpoint, egress-limit and metadata-audit tests. Live free-model capacity
is external state and is not covered by deterministic tests.

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
- [Implementation changes 1–5 and deployment requirements](docs/implementation-change-report.md)

## License and attribution

Add the intended project licence before production distribution. Map tiles and
other third-party services remain subject to their respective terms.
