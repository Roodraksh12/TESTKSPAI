# KSP-Portal Migration Notes

This file is the migration contract for moving SCRB Sahayak from the Next.js monolith to:

- `frontend/`: React 18 + Vite
- `backend/`: FastAPI + Python 3.11+
- `database/`: Neon Postgres schema mirror / migrations / seed

**Cutover status (2026-07-17):** Old Next.js / Prisma / NextAuth code has been removed. The live stack is `frontend/` + `backend/` + **Supabase Postgres**. Env uses `SUPABASE_*` / `VITE_SUPABASE_*` (no `NEXTAUTH_*` / `NEXT_PUBLIC_*`). Auth is FastAPI JWT (Badge ID + bcrypt) against the `Officer` table on Supabase; `SUPABASE_JWT_SECRET` signs tokens.

Feature parity is the acceptance criterion. UI/UX, copy, layouts, interactions, AI prompts/models, and Google Maps behavior must stay unchanged unless a discrepancy is explicitly recorded here.

## 0.1 Frontend Inventory

### Current framework and build tool

| Item | Current value |
|---|---|
| Framework | Next.js 14.2.35 App Router |
| React | React 18 |
| Language | TypeScript |
| Build/dev | `next dev`, `next build`, `next start` |
| Styling | Tailwind CSS + global CSS variables + shadcn/Radix primitives |
| Routing | Next.js file-based routes under `src/app/` |

The current app is not CRA and not Vite.

### Routes and pages

| Path | Component | Behavior |
|---|---|---|
| `/` | `src/app/page.tsx` | Redirects to login/dashboard depending on auth flow |
| `/login` | `src/app/login/page.tsx` | Badge ID/password login with demo credentials |
| `/dashboard` | `src/app/(protected)/dashboard/page.tsx`, `DashboardClient.tsx` | Investigation copilot, stats sidebar, recent cases |
| `/analytics` | `src/app/(protected)/analytics/page.tsx` | District metrics, map, charts, early warnings |
| `/hotspots` | `src/app/(protected)/hotspots/page.tsx` | Google Maps risk map and alert ranking |
| `/cases` | `src/app/(protected)/cases/page.tsx` | Filterable case directory |
| `/cases/[id]` | `src/app/(protected)/cases/[id]/page.tsx`, `client.tsx` | Case dossier, tabs, intake, drafts, matches |
| `/cases/[id]/tactical` | `src/app/(protected)/cases/[id]/tactical/page.tsx`, `TacticalView.tsx` | Tactical dossier view and PDF export |
| `/cases/[id]/chargesheet` | `src/app/(protected)/cases/[id]/chargesheet/page.tsx` | AI chargesheet generation |
| `/network` | `src/app/(protected)/network/page.tsx` | Cross-case linkage graph using mock data |
| `/fir/upload` | `src/app/(protected)/fir/upload/page.tsx` | FIR OCR upload and magic draft intake |
| `/settings` | `src/app/(protected)/settings/page.tsx` | Language preference, jurisdiction badges, audit trail |

### Shared components

| Component area | Files | Used by |
|---|---|---|
| Protected shell | `src/components/scrb/shell.tsx` | Protected layout, sidebar, header |
| Command palette | `src/components/scrb/command-palette.tsx` | Header search |
| Domain primitives | `src/components/scrb/primitives.tsx` | Most protected pages |
| Case ledger/filter | `src/components/scrb/case-ledger.tsx`, `cases-filter.tsx` | Cases list |
| Maps | `src/components/scrb/hotspot-map.tsx` | Analytics and hotspots |
| Charts/warnings | `src/components/scrb/trend-charts.tsx`, `early-warnings.tsx` | Analytics |
| Predictive steps | `src/components/scrb/predictive-steps.tsx` | Case dossier |
| Language selector | `src/components/scrb/LanguageSelect.tsx` | Settings |
| Theme/provider wrappers | `src/components/Providers.tsx`, `theme-provider.tsx`, `PageTransition.tsx` | App/layout |
| UI primitives | `src/components/ui/*` | shadcn/Radix UI components |

Dead or alternate code paths found: `src/components/scrb/chat.tsx`, `src/app/(protected)/dashboard/Chatbot.tsx`, `src/app/(protected)/dashboard/CaseLedger.tsx`, and `old_chatbot.tsx`.

### Styling

The app uses Tailwind CSS, `src/app/globals.css`, CSS custom properties, shadcn/Radix primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, `next-themes`, `framer-motion`, `tw-animate-css`, `lucide-react`, `recharts`, `jspdf`, and `jspdf-autotable`.

Decision: keep Tailwind and the existing style/component stack during migration. Rewriting to only hand-authored plain CSS would violate the no-UI-change rule. New glue code should use plain CSS only where no existing style pattern applies.

### State management

| State | Current implementation |
|---|---|
| Auth | NextAuth JWT session cookie |
| Copilot/session UI | Zustand persisted store in `src/lib/store.ts` |
| Theme | `next-themes` |
| Language | `localStorage` key `scrb_lang` plus Google Translate cookie/widget |
| Page forms | Local React state |

### Frontend environment variables

| Variable | Where | Secret? | Migration action |
|---|---|---:|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `src/components/scrb/hotspot-map.tsx` | Public client key | Rename to `VITE_GOOGLE_MAPS_API_KEY`; restrict by domain in Google Cloud |

Server-only variables currently used by the monolith: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`. `BLOB_READ_WRITE_TOKEN` appears in `.env.example` but is unused.

### Browser network calls

| Call | Method | Caller | Shape |
|---|---|---|---|
| `/api/chat` | POST | Dashboard/chat UI | `{ message, pageContext?, activeCaseId?, history[] }` -> `{ reply }` |
| `/api/search?q=` | GET | Command palette | `{ cases[], suspects[] }` |
| `/api/ai/draft-fir` | POST | FIR upload page | `{ notes }` -> `{ extractedData, rawText, possibleMatches }` |
| `/api/fir/upload` | POST | FIR upload page | multipart `file` -> OCR/extraction payload |
| `/api/cases` | POST | FIR upload page | FIR fields -> `{ success, caseId, firNumber, intake? }` |
| `/api/cases/[id]/intake` | GET | Case dossier | `{ intake }` |
| `/api/cases/[id]/draft` | POST | Case dossier | `{ audience }` -> `{ draft }` |
| `/api/cases/[id]/matches` | PATCH | Case dossier | `{ matchId, status }` -> `{ success, match }` |
| `/api/cases/[id]/chargesheet` | POST | Chargesheet page | `{ success, chargesheet }` |
| `/api/ai/predict-steps` | POST | Predictive steps widget | `{ caseId }` -> `{ steps[] }` |
| Google Maps JS | script/API | Hotspot map | Client map rendering |
| Google Translate widget | script | Root layout/language selector | Translate widget |

No browser Supabase calls exist today. OpenRouter is already server-side.

### Auth flow today

- NextAuth Credentials provider in `src/lib/auth.ts`.
- Login fields: Badge ID and password.
- Passwords are bcrypt hashes in `Officer.passwordHash`.
- Session strategy is JWT in an HTTP-only NextAuth cookie.
- Session user fields: `id`, `badgeId`, `role`, `stationId`, `districtId`, `name`.
- Protected routes are guarded by `src/middleware.ts` plus page-level checks. `/analytics` is missing from middleware but has page-level protection.
- No signup flow.

### Auth adaptation (implemented)

Supabase Postgres is the database. FastAPI Badge ID login checks `Officer.passwordHash` (bcrypt) and signs JWTs with `SUPABASE_JWT_SECRET`. Frontend stores `ksp_token` / `ksp_user`. No NextAuth / Neon / local Postgres env.

## 0.2 Backend Inventory

There is no standalone backend. Backend logic is embedded in Next.js API route handlers and server components.

| Area | Current implementation |
|---|---|
| Framework | Next.js route handlers |
| Language | TypeScript |
| Entry points | `src/app/api/**/route.ts`, server components under `src/app/(protected)` |
| Data access | Prisma client in `src/lib/prisma.ts` |
| Auth | `getServerSession(authOptions)` in most routes |
| Middleware | NextAuth `withAuth`; no CORS/rate limiting/custom logging |
| Background jobs | None |
| Websockets/SSE | None |

### API routes

| Method | Path | Current file | Side effects |
|---|---|---|---|
| GET/POST | `/api/auth/*` | `src/app/api/auth/[...nextauth]/route.ts` | NextAuth cookies/session |
| POST | `/api/chat` | `src/app/api/chat/route.ts` | OpenRouter tool loop, DB reads/writes, audit log |
| GET | `/api/search` | `src/app/api/search/route.ts` | DB reads; currently unauthenticated |
| POST | `/api/ai/draft-fir` | `src/app/api/ai/draft-fir/route.ts` | OpenRouter extraction, DB match reads |
| POST | `/api/ai/predict-steps` | `src/app/api/ai/predict-steps/route.ts` | OpenRouter next-step generation |
| POST | `/api/fir/upload` | `src/app/api/fir/upload/route.ts` | Tesseract OCR, OpenRouter extraction, DB match reads |
| POST | `/api/cases` | `src/app/api/cases/route.ts` | Creates case, persons, links, matches, audit log |
| GET | `/api/cases/[id]/intake` | `src/app/api/cases/[id]/intake/route.ts` | Builds intake brief, audit log |
| POST | `/api/cases/[id]/draft` | `src/app/api/cases/[id]/draft/route.ts` | Draft text, audit log |
| PATCH | `/api/cases/[id]/matches` | `src/app/api/cases/[id]/matches/route.ts` | Updates match status, audit log |
| POST | `/api/cases/[id]/chargesheet` | `src/app/api/cases/[id]/chargesheet/route.ts` | OpenRouter chargesheet generation |

Server components directly read Prisma for dashboard, cases list/detail, tactical view, analytics, hotspots, and settings. FastAPI must expose replacement read endpoints for those flows.

## 0.3 Database Inventory

Current database is PostgreSQL through Prisma. There is no Supabase folder, no SQL migrations, no RLS policies, no triggers, no functions, and no storage buckets.

Source of truth today: `prisma/schema.prisma`.

### Models

| Model | Purpose |
|---|---|
| `District` | District master data |
| `PoliceStation` | Stations linked to districts |
| `Officer` | Auth user/profile records |
| `Case` | FIR/case records |
| `Person` | Accused/victim/witness records |
| `CasePerson` | Case/person join |
| `Connection` | Person-to-person links |
| `CaseMatch` | Identity/MO match leads |
| `ChatSession` | Schema only; mostly unused |
| `ChatMessage` | Schema only; mostly unused |
| `AuditLog` | Officer action logs |
| `Alert` | Hotspot/anomaly alerts |
| `Feedback` | Chat feedback; schema only |

Enums: `Role`, `CaseStatus`, `PersonRole`, `RelationType`, `MatchStatus`, `MessageRole`, `AlertType`, `Rating`.

Database migration strategy: translate the Prisma schema into SQL under `database/migrations/`, add Supabase Auth linkage for officers, seed demo data and auth users, and provide a one-off data migration script.

Storage: no bucket is required for current parity because FIR files are processed in memory and not persisted. Evidence attachments are placeholder UI only.

## Discrepancies and Risks

| Finding | Impact | Resolution |
|---|---|---|
| Docs mention Leaflet, code uses Google Maps | Map migration assumptions could be wrong | Keep Google Maps unchanged |
| README mentions SQLite in places, schema uses PostgreSQL | DB migration source ambiguity | Trust `prisma/schema.prisma` |
| README/docs mention Server Actions, none exist | Backend port scope could be overstated | Port route handlers and server-component reads |
| `/api/search` has no auth | Existing behavior leaks data | Add auth in FastAPI while preserving response shape; record as security fix |
| `/analytics` missing from middleware matcher | Protection inconsistency | Vite route guard protects it |
| `@vercel/blob` and `BLOB_READ_WRITE_TOKEN` unused | Avoid unnecessary storage migration | Do not create storage bucket for Blob |
| Chargesheet/tactical routes are unlinked | Feature could be missed | Keep exact routes in React Router |
| OpenRouter already server-side | Phase 6 is a port, not a key-removal rescue | Keep key backend-only and rotate if exposed outside repo |

## Retained Libraries and Justification

| Library/area | Decision |
|---|---|
| Tailwind/shadcn/Radix | Retain to preserve UI exactly |
| framer-motion | Retain existing page and UI motion |
| Zustand | Retain copilot/intake persisted UI behavior |
| `@vis.gl/react-google-maps` | Retain provider and map behavior |
| `recharts` | Retain analytics visuals |
| `jspdf`, `jspdf-autotable` | Retain tactical report export |
| `react-markdown`, `remark-gfm` | Retain markdown rendering |
| `react-router-dom` | Required Vite route replacement |
| `next-themes` | Retained for dark/light theme parity |
| `pytesseract`, `pillow` | Python backend replacement for current Tesseract OCR |
| `psycopg[binary]` | Neon Postgres access + data scripts |
| `bcrypt`, `PyJWT` | FastAPI Badge ID auth parity with NextAuth credentials |

## Feature Parity Checklist

| # | Feature | Where it lives now | Status after migration |
|---:|---|---|---|
| 1 | Badge ID login | `frontend/src/pages/Login.tsx` + `POST /api/auth/login` | ☑ done |
| 2 | Demo users | Neon `Officer` rows (seeded) | ☑ done |
| 3 | Protected app shell | `ProtectedRoute` + `ProtectedLayout` | ☑ done |
| 4 | Sign out | AuthContext + shell | ☑ done |
| 5 | Role/station RBAC | FastAPI deps + station scope | ☑ done |
| 6 | Sidebar navigation | `frontend/src/components/scrb/shell.tsx` | ☑ done |
| 7 | Command palette search | command-palette + `GET /api/search` | ☑ done |
| 8 | Dark/light theme | theme-provider + mode-toggle | ☑ done |
| 9 | EN/KN language preference | LanguageSelect | ☑ done |
| 10 | Dashboard copilot chat | DashboardClient + `POST /api/chat` | ☑ done |
| 11 | Voice input | DashboardClient | ☑ done |
| 12 | Copilot attachment filename behavior | DashboardClient | ☑ done |
| 13 | Dashboard stats/recent cases | `GET /api/dashboard` | ☑ done |
| 14 | FIR OCR upload | FirUpload + `POST /api/fir/upload` | ☑ done |
| 15 | Magic Draft FIR | `POST /api/ai/draft-fir` | ☑ done |
| 16 | Pre-save match preview | FIR/AI routes + intake_intel | ☑ done |
| 17 | Save case from FIR | `POST /api/cases` | ☑ done |
| 18 | Cases list filters/cards | Cases page + `GET /api/cases` | ☑ done |
| 19 | Case dossier overview/tabs | CaseDetail + `GET /api/cases/{id}` | ☑ done |
| 20 | Case intake brief | `GET /api/cases/{id}/intake` | ☑ done |
| 21 | Draft update | `POST /api/cases/{id}/draft` | ☑ done |
| 22 | Predictive next steps | `POST /api/ai/predict-steps` | ☑ done |
| 23 | Confirm/reject matches | `PATCH /api/cases/{id}/matches` | ☑ done |
| 24 | Chargesheet generation | Chargesheet page + API | ☑ done |
| 25 | Tactical view/PDF export | Tactical page | ☑ done |
| 26 | Network graph | Network page + mock | ☑ done |
| 27 | Hotspot Google Map | hotspot-map + `VITE_GOOGLE_MAPS_API_KEY` | ☑ done |
| 28 | Hotspot alert ranking | `GET /api/hotspots` | ☑ done |
| 29 | Analytics metrics | `GET /api/analytics` | ☑ done |
| 30 | Mock trend/radar/warnings | Analytics components | ☑ done |
| 31 | Settings jurisdiction badges | Settings + auth user | ☑ done |
| 32 | Settings audit trail | `GET /api/settings/audit` | ☑ done |
| 33 | Fairness/human oversight statement | Settings page | ☑ done |

