# SCRB Sahayak — Liquid Glass Redesign Plan

An Apple Liquid Glass-inspired investigation OS for Karnataka SCRB. Frontend-only prototype (mocked data) with the chat experience as the hero. No backend enabled unless you ask — we can layer Lovable Cloud later for auth + persistence.

## Scope (v1)

Screens:
1. **Login** — split layout, animated seal, glass login card, demo credentials.
2. **App shell** — floating glass top nav (seal, product, district/station, badge, role pill, language, sign out) + floating bottom-center dock (Dashboard, Cases, Network, Hotspots, FIR Upload, Settings).
3. **Dashboard** — 70/30 asymmetric: massive glass chat + floating case ledger stack.
4. **Case Dossier** — segmented tabs: Overview, Timeline, Connections, Evidence, Matches.
5. **Network** — full-canvas glass graph with floating inspector.
6. **Hotspots** — map surface with floating risk/trend/anomaly glass cards.
7. **FIR Upload** — centered dropzone + multi-step extraction cards + editable extracted fields.
8. **Settings** — language, jurisdiction, audit trail, fairness statement.

Out of scope for v1: real auth, real DB, real ML/graph engine, real map tiles beyond a styled placeholder, i18n runtime switching (toggle is visual).

## Design System

Tokens in `src/styles.css` (`@theme inline` + `:root`):
- Colors (oklch equivalents): ink `#0B1B2B`, secondary `#142A44`, amber `#E2A33D`, teal `#2E8F8F`, glass white/border, soft shadow.
- Background: layered dark gradient (navy → slate → teal hint) with two soft radial light blobs, fixed.
- Radii: card 28, panel 32, button 20, input 20, bubble 24, pill 999.
- Shadows: soft-lift, glass-inset.
- Glass utilities via `@utility`: `.glass` (bg white/12, border white/18, `backdrop-filter: blur(24px)`, soft shadow), `.glass-strong`, `.glass-teal` (AI), `.glass-ink` (officer bubble).

Typography via `<link>` in `__root.tsx` head:
- Display serif: **Spectral** (headings, product name).
- Body sans: **Inter** (UI).
- Mono: **JetBrains Mono** (FIR IDs, badges, case IDs).

Motion: Tailwind + tw-animate-css only — fade, scale 0.98→1, subtle lift on hover. No bounce/parallax.

Icons: `lucide-react`, each wrapped in a circular glass container component.

## Architecture

TanStack Start routes (file-based):
- `src/routes/__root.tsx` — head metadata (real title/description/OG), fonts link, background layer, `<Outlet />`.
- `src/routes/index.tsx` — Login screen (no shell).
- `src/routes/_app.tsx` — pathless layout that renders the floating TopNav + Dock + `<Outlet />` for authenticated app.
- `src/routes/_app/dashboard.tsx`
- `src/routes/_app/cases.tsx` (list) and `src/routes/_app/cases.$caseId.tsx` (dossier)
- `src/routes/_app/network.tsx`
- `src/routes/_app/hotspots.tsx`
- `src/routes/_app/fir-upload.tsx`
- `src/routes/_app/settings.tsx`

"Auth" for v1: a `useDemoSession` hook backed by `localStorage` (badge id, district, station, role). Login writes it; `_app` layout redirects to `/` if missing. Sign out clears and navigates home.

Shared components in `src/components/scrb/`:
- `GlassPanel`, `GlassCard`, `GlassButton`, `GlassInput`, `GlassPill`, `IconOrb`
- `TopNav`, `Dock`, `BackgroundLayer`
- `ChatPanel`, `ChatBubble`, `ChatInput`, `SuggestedPrompts`, `SourceChip`, `ConfidenceChip`, `WhyPopover`, `TypingShimmer`
- `CaseLedger`, `CaseCard`, `StatusPill`
- `SegmentedTabs`, `Timeline`, `EvidenceCard`, `MatchRow`
- `NetworkCanvas` (SVG-based nodes/edges, no heavy lib), `NodeInspector`
- `HotspotMap` (styled SVG/CSS placeholder), `RiskList`, `TrendChart` (minimal SVG)
- `UploadDropzone`, `ExtractionSteps`, `ExtractedFieldsForm`

Mock data in `src/lib/mock/` (cases, messages, entities, hotspots, FIR sample).

## Chat Behavior (v1)

Local-only. `sendMessage(text)` pushes user bubble, shows `TypingShimmer` ("Checking police records…"), then reveals a scripted AI response with source chips, confidence %, and a "Why" popover. No LLM call in v1 — clearly a prototype. Suggested prompt pills seed common queries. Voice/attachment buttons are visual (disabled with tooltip).

## Accessibility & Contrast

- All glass surfaces sit on the dark background — foreground text stays near-white; secondary text uses muted white with sufficient contrast.
- Amber used sparingly for primary CTAs and active dock state; never as background behind body text.
- Focus rings visible on glass (amber outline).

## Head Metadata

Root `head()`: title "SCRB Sahayak — Karnataka Police Investigation Copilot", matching description, og/twitter tags. No og:image at root. Leaf routes override title/description per screen.

## Deliverables Checklist

- Tokens + glass utilities in `src/styles.css`
- Fonts loaded via `<link>` in `__root.tsx`
- Background layer component mounted app-wide
- All 8 screens routed and navigable via Dock
- Chat prototype with scripted response + source/confidence/why
- Case ledger → dossier flow with segmented tabs
- Network canvas with hover/select inspector
- Hotspots with floating cards
- FIR upload with animated multi-step extraction
- Settings sections
- Desktop-first, tablet-friendly (dock collapses to bottom bar)

## Open Questions (I'll assume defaults unless you say otherwise)

1. **Data**: mock-only for v1 (recommended) vs. wire Lovable Cloud now for cases/users/audit.
2. **Chat AI**: scripted mock vs. real Lovable AI Gateway call (needs Cloud on).
3. **Language toggle**: visual only vs. actual English/Kannada strings.

Default assumption: mock-only, scripted chat, visual language toggle. Reply with changes or "go" and I'll build.