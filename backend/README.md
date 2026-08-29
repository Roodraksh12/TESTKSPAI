# Backend (FastAPI)

SCRB Sahayak API — JWT badge login, jurisdiction-scoped case access, cascading invitations.

## Quick start

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Ensure backend/.env has DATABASE_URL + SUPABASE_JWT_SECRET
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Apply DB migrations in order (see `database/README.md`). The isolated hackathon
test database currently progresses through migration **0017**; never apply the
experimental reporting/playbook migrations to the original shared round-one
database.

```powershell
.\.venv\Scripts\python.exe scripts\apply_0004.py
.\.venv\Scripts\python.exe scripts\apply_0005.py
.\.venv\Scripts\python.exe -m scripts.apply_0006
.\.venv\Scripts\python.exe -m scripts.apply_0013
.\.venv\Scripts\python.exe -m scripts.apply_0014
.\.venv\Scripts\python.exe -m scripts.apply_0015
.\.venv\Scripts\python.exe -m scripts.apply_0016
.\.venv\Scripts\python.exe -m scripts.apply_0017
.\.venv\Scripts\python.exe -m scripts.refresh_early_warnings
```

## Bootstrap admin — Police IT

After migrations + seed, sign in with (also set in `backend/.env`):

| Field | Value / env |
|---|---|
| Service / Badge ID | `KA-IT-0001` (`BOOTSTRAP_BADGE_ID`) |
| Password | `demo1234` (`BOOTSTRAP_PASSWORD`) |
| Role | `POLICE_IT` |

Police IT lands on **Administration**, can invite gazetted ranks (DGP/IGP through ASP/ACP), and has **read-only** statewide Overview / Analytics / Audit. Case create, FIR upload, and match confirms return **403**.

Other seed accounts (`KA-INS-4471`, `KA-SP-9999`, `KA-CON-1001` / `demo1234`) remain for local testing but are not exposed on the login UI.

## Jurisdiction model

| Rank | Case scope |
|---|---|
| Police IT, DGP/IGP, ADGP | Statewide |
| IGP | Command range (`CommandRange`) |
| DIG | Assigned districts (`OfficerDistrict`) |
| SP / Addl SP / ASP | District |
| DySP | Sub-division (`Range` table) |
| SHO / Inspector / leaves | Station |

`"Range"` = DySP subdivision. `"CommandRange"` = IGP range of several districts.

## Optional SMTP

Set these in `.env` for invitation / password-reset emails (HTML + plain text templates in `app/services/mailer.py`):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-gmail-app-password
SMTP_FROM=you@gmail.com
SMTP_USE_TLS=true
APP_PUBLIC_URL=http://localhost:5173
```

If `SMTP_HOST` is empty, invite bodies are logged to the server console. Restart uvicorn after changing SMTP settings.

## AI provider

The default remains OpenRouter, using `OPENROUTER_API_KEY` and
`OPENROUTER_MODEL`. Every OpenRouter request is locally tokenised. By default,
`OPENROUTER_ZDR_REQUIRED=true` also enforces a Zero Data Retention route, and a
selected model without a current ZDR-capable endpoint fails closed. A synthetic
demo environment may temporarily set `OPENROUTER_ZDR_REQUIRED=false`; this must
never be used with real police, personal, or sensitive case data. To route AI
calls to an approved private deployment that supports the OpenAI-compatible
chat-completions contract, set:

```dotenv
AI_PROVIDER=openai_compatible
AI_BASE_URL=http://your-private-ai-host:port/v1
AI_MODEL=your-deployed-model
AI_API_KEY=
AI_PRIVATE_ENDPOINT=true
```

No router or frontend change is needed when switching providers. Do not mark an
ordinary third-party endpoint private. Set `AI_EXTERNAL_MODE=disabled` to block
all external model calls. Set `AI_PRIVACY_AUDIT_REQUIRED=true` in a controlled
deployment when AI requests must fail if audit metadata cannot be written.

Migration 0014 adds metadata-only `AiRequestAudit` records and assistant-message
privacy metadata. It does not store prompts, completions or token maps. Preview
the configured local chat retention policy with:

```powershell
.\.venv\Scripts\python.exe -m scripts.purge_ai_history
.\.venv\Scripts\python.exe -m scripts.purge_ai_history --apply
```

The purge command is dry-run unless `--apply` is present. See
`../docs/implementation-change-report.md` for the complete security boundary,
limitations and deployment decisions.
