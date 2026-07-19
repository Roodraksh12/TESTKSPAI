# SCRB Sahayak — Module-by-Module Implementation Plan

**Purpose:** Port every feature of this project onto a new/updated tech stack without losing anything.
**Audience:** You (or an AI assistant) starting fresh in a new chat with no prior context.
**Source project:** Next.js 14 (App Router) + Prisma + PostgreSQL + NextAuth + OpenRouter LLM.

---

## HOW TO USE THIS DOCUMENT

1. Read **Part 0** (context) and **Part 1** (data model) first — everything depends on the data model.
2. Implement modules in the order given in **Part 6** (dependency order).
3. Each module is tagged:
   - 🟢 **PURE LOGIC** — no framework/DB imports. Copy the algorithm directly into any stack (TS, Python, Go…).
   - 🟡 **DATA LAYER** — needs your ORM/query layer. Logic is portable, queries are not.
   - 🔵 **FRAMEWORK** — UI/routing/auth. Must be rewritten for your stack; behaviour spec given.
4. Every module has **Acceptance criteria** — implement until those pass.
5. **Part 5** is the master feature checklist. Nothing is done until every box is ticked.

---

# PART 0 — PROJECT CONTEXT

**What it is:** An AI investigation assistant for Karnataka State Police (State Crime Records
Bureau). Officers query crime records in natural language, see linked cases/suspects as a network,
track crime hotspots, and get warned before statutory legal deadlines lapse.

**Built for:** KSP Datathon 2026, Challenge 01 — "Intelligent Conversational AI for KSP Crime Database".

**The 9 required features (from the official brief):**
1. Natural language chatbot (English + Kannada)
2. Voice-enabled interaction
3. Context-aware conversations
4. PDF export of conversation history
5. Criminal network visualization
6. Crime trend & hotspot detection
7. Predictive analytics & early warnings
8. Explainable AI with audit trails
9. Role-based secure access

**Plus differentiator features built beyond the brief** (these are the competitive edge):
- Statutory Deadline Tracker ("Default-Bail Shield")
- Network investigation toolkit (ring detection, broker ranking, path-finding, evidence board)

**Core design principle (state this in the pitch):** The AI never asserts facts on its own. Every
claim is grounded in a database tool result, every match carries a confidence score, and **no
action is taken without officer confirmation**. Everything is audit-logged.

---

# PART 1 — DATA MODEL (build this first)

Relational schema. Field names below are the source-of-truth contract used by every module.

### District
`id` (pk), `name`

### PoliceStation
`id` (pk), `name`, `districtId` → District

### Officer
`id` (pk), `badgeId` (unique), `passwordHash`, `name`, `role` (enum: `CONSTABLE|INSPECTOR|SP`), `stationId` → PoliceStation

### Case  ⭐ central table
`id` (pk), `firNumber` (unique), `stationId` → PoliceStation, `crimeType` (string),
`status` (enum: `OPEN|UNDER_INVESTIGATION|CHARGESHEETED|CLOSED`), `incidentDate` (datetime),
`reportedDate` (datetime, default now), `latitude` (float, nullable), `longitude` (float, nullable),
`summary` (text, nullable), `rawExtractedText` (text, nullable), `createdFromScan` (bool)

> `latitude`/`longitude` power the hotspot map. `reportedDate` drives statutory deadline clocks.
> `incidentDate` drives trend charts. Don't conflate the two dates.

### Person
`id` (pk), `name`, `role` (enum: `ACCUSED|VICTIM|WITNESS`), `phone` (nullable), `address` (nullable)

### CasePerson (join)
`id`, `caseId` → Case, `personId` → Person, `role` (PersonRole)

### Connection (person ↔ person)
`id`, `personAId` → Person, `personBId` → Person,
`relationType` (enum: `CO_ACCUSED|SAME_ADDRESS|SAME_PHONE|PRIOR_CASE_TOGETHER`), `sourceCaseId` (nullable)

### CaseMatch (AI-suggested links — the explainability backbone)
`id`, `caseId` → Case, `matchedCaseId` (nullable) → Case, `matchedPersonId` (nullable) → Person,
`confidenceScore` (float 0-100), `status` (enum: `PENDING|CONFIRMED|REJECTED`), `reason` (text)

> Every AI-suggested link lands here as `PENDING`. An officer confirms/rejects. This is what makes
> the system "leads only, human in the loop".

### AuditLog
`id`, `officerId` → Officer, `action` (string), `targetType` (string), `targetId` (nullable),
`details` (text, nullable), `createdAt` (datetime, default now)

### Alert
`id`, `stationId` → PoliceStation, `type` (enum: `HOTSPOT|ANOMALY`), `zoneLabel`,
`riskScore` (float), `reason` (text), `createdAt`

### (Optional, currently unused but in schema) ChatSession, ChatMessage, Feedback
Only build these if you want server-persisted chat history. The current app keeps chat in
client state + localStorage.

**Seed data required for a credible demo:**
- 3 officers, one per role, same password, badge IDs like `KA-INS-4471` / password `demo1234`
- 6 districts, 3+ stations
- ~30 cases spread across the **last 6 months** (for trend charts) with lat/long set
- A cluster of 4-6 recent same-crime-type cases in the last 7 days (makes the velocity spike fire)
- Several cases **older than 60 days still OPEN** (makes the deadline tracker show OVERDUE rows)
- Persons shared across ≥2 cases (makes the network graph show real links)
- At least one `Connection` and several `CaseMatch` rows

---

# PART 2 — CORE LOGIC MODULES

---

## M1 · Auth & Role-Based Access Control 🔵 FRAMEWORK

**Purpose:** Officers log in with Badge ID + password. Role determines data visibility.

**Behaviour spec:**
- Credential login: `badgeId` + `password`, verified with bcrypt against `Officer.passwordHash`.
- Session (JWT) must carry: `id`, `badgeId`, `role`, `stationId`, `districtId`.
- **The RBAC rule used everywhere (memorise this):**
  ```
  scope = (role === "SP") ? {} : { stationId: session.stationId }
  ```
  SP sees district-wide; everyone else sees only their own station. Apply this `scope` as the
  filter on EVERY case/alert query in every module.
- Protect all app routes except `/login`. Redirect unauthenticated users to `/login`.
- Restrict certain AI tools by role (see M7).

**Acceptance criteria:**
- Constable and SP logging in see different case counts on the dashboard.
- Hitting any protected route logged-out redirects to login.
- No API route returns data without a valid session (see the security note in M8).

---

## M2 · Intake Intelligence Engine 🟡 DATA LAYER
*(Existed in the original project; keep it — it's the strongest differentiator after the deadline tracker.)*

**Purpose:** When an FIR is filed, automatically produce an investigation brief: who might this
person be, which past cases look similar, what law applies, what to do in the next 72 hours.
**All rule-based and auditable — no LLM hallucination.**

### Text similarity primitives 🟢 PURE
```
tokenize(text)     → lowercase, strip non-alphanumeric, split, drop tokens ≤2 chars and stopwords
                     stopwords include: the, and, for, with, from, case, accused, victim, police,
                     station, report, fir, ... (domain words removed so they don't inflate matches)
jaccard(a, b)      → |a ∩ b| / |a ∪ b|
nameSimilarity(a,b)→ exact match = 1.0
                     one contains the other = 0.85
                     else jaccard of word sets
```

### Identity matching (`findIdentityMatches`)
For each person in the DB, score against the incoming names/phones/addresses:
- Name similarity ≥ 0.55 → score = round(sim × 100)
- **Phone match** (exact, or last-8-digits match) → score = 95 (strongest signal)
- Address token overlap (jaccard ≥ 0.4) → score = 70 + sim×25
- Discard anything scoring < 55. Sort desc, cap at 8 results.
- Return: personId, name, role, confidenceScore, **human-readable `reason` string**, prior FIR numbers.

> The `reason` string is what makes it explainable — e.g. *"Name similarity 87% ("Ravi Kumar" ↔ "Ravi K"); Same phone pattern: 9876543210"*.

### MO (modus operandi) similarity (`findMoSimilarCases`)
- Build probe text = MO tag + summary + crimeType of the current case.
- Compare against up to 50 recent cases at the same station.
- `score = jaccard(probeTokens, candidateTokens) + (sameCrimeType ? 0.15 : 0)`, capped 0.99.
- Drop if score < 0.18 and crime types differ; drop if < 0.12 always.
- Return top 5 with reason strings.
- MO is stored inline in `summary` as a tagged line: `[MO] two-wheeler snatch on arterial road`.
  Helpers: `extractMoFromText()`, `packSummaryWithMo()`.

### Legal section suggestion 🟢 PURE (`suggestLegalSections`)
Lookup table keyed by crime type → `{ sections[], evidenceNeeded[], notes }`.
Cover at minimum: theft, vehicle theft, chain snatching, robbery, burglary, assault, fraud,
economic offence, missing person. Include **both IPC and BNS** section numbers (India moved to
BNS; showing both reads as domain-aware). Fall back to keyword sniffing on the summary, then to a
safe generic "officer must select sections" response.

### Investigation checklist 🟢 PURE (`getInvestigationChecklist`)
Per crime type, an ordered list of actions bucketed into time windows `0-6h | 6-24h | 24-72h`,
each with `action` + **`rationale`** (why it matters — e.g. *"Footage often overwrites within 24–72h"*).
Cover theft, vehicle theft, chain snatching, burglary, and a default set.

### Intake brief assembly (`buildCaseIntakeBrief`)
Runs everything above for a case, persists suggested links as `PENDING` CaseMatch rows, and returns
both structured data **and a pre-formatted markdown brief** for the chat, containing:
extracted facts → identity leads → MO-similar cases → legal framing → next-24h actions → hotspot
context → and the closing line **"Nothing is filed until you confirm."**

### Also provides
- `draftCaseSummary(caseId, audience)` — generates an SP/SHO/IO progress note **without any LLM**
  (fully deterministic, works offline).
- `updateMatchStatus(matchId, CONFIRMED|REJECTED, officerId)` — writes an AuditLog entry.

**Acceptance criteria:**
- Saving an FIR with an accused name matching an existing person produces a PENDING CaseMatch with a readable reason.
- The markdown brief renders with all 6 sections.
- Confirming a match writes `CONFIRM_MATCH` to AuditLog.

---

## M3 · Analytics Engine 🟡 DATA LAYER

**Purpose:** Everything on the Analytics + Hotspots dashboards. **Every number must come from the
database — no hardcoded arrays.** (The original draft faked all of this; that's the #1 thing judges catch.)

### `getCrimeTrend(scope)` → 6-month line chart
- Bucket cases by calendar month for the last 6 months using `incidentDate`.
- Auto-pick the **top 4 crime types** by volume in that window; each becomes a chart series.
- Return `{ data: [{month:"Jan", theft:3, burglary:1, ...}], series: [{key,label,color}] }`.
- Return empty series when there's no data (UI shows an empty state, not a fake chart).

### `computeCrimeVelocity(scope)` → the honest "prediction" heuristic
```
recentCount   = cases of this crime type in the last 7 days
baselineWeekly= (cases in the preceding 8 weeks) / 8
risk = baselineWeekly === 0
         ? (recentCount > 0 ? 70 : 15)          // no history to compare against
         : clamp(round(recentCount / baselineWeekly * 50), 5, 99)
```
> 50 = exactly at baseline. 100 = double the usual rate. **Be honest in the pitch: this is a
> rate-of-change heuristic over real case data, not a trained ML model.** A judge who asks
> "is this a real model?" must get a straight answer — a defensible heuristic beats a fabricated 78%.

### `getRiskForecast(scope)` → radar chart
Top 5 crime types by velocity risk, plotted against a baseline of 50.

### `getEarlyWarnings(caseScope, alertScope)` → the alert feed
Merges three real sources, sorted by probability, capped at 6:
1. **Alert table rows** (hotspots/anomalies) → probability = `riskScore`
2. **Velocity spikes** (risk ≥ 65 and ≥2 recent cases) → reasoning cites the actual counts vs baseline
3. **Statutory deadline breaches** (from M6) → probability 95 if lapsed / 85 if urgent, max 3 of these

Each warning: `{ type, probability, location, timeframe, reasoning, action, urgency }`.
The `reasoning` field must cite real numbers so it's explainable.

### `getHotspotClusters(scope)` → map markers
- Query cases where lat/long are non-null.
- Bucket into a **0.01° grid** (~1.1 km cells). Average the coordinates in each cell.
- Label by the most frequent crime type in the cell: `"Vehicle Theft cluster (7)"`.
- Intensity: `count ≥ 3 → high`, `=2 → medium`, `=1 → low`. Radius scales with count.

### `getHighRiskSummary(alertScope)` and `getDailyCaseVolume(scope, days)`
Stat-card counts and a 7-day sparkline series. Both from real rows.

**Acceptance criteria:**
- Adding a case changes the trend chart and hotspot map.
- No component renders a number that isn't traceable to a query.
- Empty database → charts show empty states, never fake data.

---

## M4 · Offline Geocoder 🟢 PURE

**Purpose:** FIR intake extracts a location as *text* ("ITPL parking, Whitefield"). The hotspot map
needs coordinates. **Without this, cases created in-app never appear on the map** — a real bug that
existed in the draft.

**Design:** A local gazetteer, deliberately **no paid geocoding API**.
- Dictionary of ~30 Karnataka localities → lat/long (Whitefield, Indiranagar, Koramangala, ITPL,
  MG Road, Electronic City, Hebbal, Jayanagar, HSR, BTM… plus district centres: Mysuru, Belagavi,
  Mangaluru, Kalaburagi, Hubballi, Dharwad).
- `geocodeLocation(locationText, hintText)`:
  1. Lowercase and concatenate location + hint (hint = the officer's station name).
  2. Match gazetteer keys **longest-first** (so "electronic city" beats a stray "city").
  3. Fall back to Bengaluru centre if nothing matches.
  4. Add **deterministic jitter** of ±~0.8 km, seeded by a hash of the location text, so multiple
     cases at the same locality spread into a visible cluster instead of stacking on one pixel.
- Must be deterministic: same input → same output, every time.

**Acceptance criteria:**
- "Kuvempunagar, Mysuru" resolves near Mysuru (12.28, 76.62) — **not** Bengaluru.
- Vague text + "Whitefield PS" hint resolves near Whitefield.
- Same input twice = identical coordinates; two different inputs at one locality = distinct points.
- All outputs fall inside Karnataka bounds (lat 11–18.5, lng 74–78.6).

---

## M5 · Graph Engine 🟢 PURE  ⭐ differentiator

**Purpose:** All criminal-network maths. **Keep this file free of DB/framework imports** — it is
directly portable and unit-testable.

**Types:**
```
NodeKind = "Case" | "Person" | "Vehicle" | "Location"
RawNode  = { id, label, kind, sub?, detail?, date? }
NetworkNode = RawNode + { x, y }        // after layout
NetworkEdge = { from, to, label }
```
Node IDs are namespaced: `case:<id>`, `person:<id>`, `vehicle:<PLATE>`, `loc:<stationId>`.

### `buildAdjacency(edges)` → `Map<nodeId, Set<neighbourId>>` (undirected)

### `neighborhood(edges, seedId, hops)` → BFS to N hops
**This is the key to scalability.** Never render the whole graph; render only the neighbourhood the
investigator expands into.

### `shortestPath(edges, from, to)` → node-id chain or null
BFS. Powers "how is suspect A connected to case B?".

### `computeKeyPlayers(nodes, edges, limit)` → **Hubs**
Rank by degree (number of direct links). Skip Location nodes. Produce a human breakdown string
like `"2 cases · 3 people · 1 vehicle"`.

### `findRings(nodes, edges)` → **crime ring detection**
Connected-components, with two critical rules:
1. **Exclude Location nodes before computing components** — every case links to its station, so
   including them collapses the whole jurisdiction into one meaningless blob.
2. **Only keep components containing ≥2 Cases** — one case plus its own participants is not a ring.
Label each ring after its highest-degree Person ("Around Manjunath S"); report case/person/vehicle counts.

### `computeBrokers(nodes, edges, limit)` → **betweenness centrality** (Brandes' algorithm)
Also excludes Location nodes. A **hub** has many links; a **broker** sits *on the shortest paths
between others* — the fence/fixer whose removal fragments the network. Divide the final score by 2
(undirected graphs count each pair twice).
> This distinction is the pitch line: *"Hubs are the busiest. Brokers are the ones holding the
> network together — arrest priority."*

### `layoutGraph(nodes, edges)` → assigns x/y in a 0–100 box
Deterministic Fruchterman-Reingold force layout: repulsion between all pairs, attraction along
edges, cooling temperature, slight pull to centre, then normalise to fit the viewport.
**Seed the RNG** so the layout is identical on server and client (avoids hydration mismatch).
Run it **server-side** so there's no first-paint jump.

**Acceptance criteria (unit-testable with a synthetic graph):**
- Two case-clusters joined only through one person = **one** ring of 4 cases (station links ignored).
- That bridging person ranks **#1 broker** even when other nodes have more direct links.
- An isolated single case is **not** reported as a ring.
- `shortestPath` returns the correct hop count.

---

## M6 · Statutory Deadline Engine 🟢 PURE + 🟡 query  ⭐⭐ flagship differentiator

**Purpose:** *This is the feature that wins over police judges.* Under **BNSS Section 187(3)**
(successor to CrPC 167(2)), if the charge sheet isn't filed within **60 days** — **90 days** for
offences punishable by death/life/10+ years — the accused becomes **automatically entitled to
default bail**. Courts grant it even on day 61. Real accused walk free because a date slipped, and
investigating officers track dozens of cases manually on paper.

### Gravity classification 🟢 PURE
`isGraveOffence(crimeType, summary)` — keyword match against: murder, homicide, rape, POCSO,
dacoity, robbery, kidnap, abduct, acid, trafficking, terror, waging war, counterfeit, organised crime.
→ grave = **90-day** window, otherwise **60-day**.

### Clock computation 🟢 PURE
`computeCaseClocks(case, now)` produces **two clocks per case**:

| Clock | Window | Statute | Consequence |
|---|---|---|---|
| Charge sheet filing | 60d (90d grave) | BNSS 187(3) | *Accused becomes entitled to DEFAULT BAIL* |
| Victim progress update | 90d | BNSS 193(3)(ii) | Statutory duty to inform victim/informant |

```
dueDate  = reportedDate + windowDays
daysLeft = ceil((dueDate - now) / 1 day)          // negative = overdue
tier     = daysLeft <  0  → OVERDUE
           daysLeft ≤ 15  → URGENT
           daysLeft ≤ 30  → WATCH
           else           → ON_TRACK
if case.status is CHARGESHEETED or CLOSED → tier = COMPLIANT (clock stopped)
```
The case's headline tier = the worst of its clocks.

### `getComplianceBoard(scope)` 🟡
All cases, sorted worst-tier-first then fewest-days-left, plus a summary count per tier.

### `getDeadlineRisks(scope, take)` 🟡
Compact JSON for the AI tool — active (OPEN/UNDER_INVESTIGATION) cases only, non-healthy tiers only.

**⚠️ Honesty requirement (say this on the page and in the pitch):** Clocks anchor to the **FIR
reported date** because arrest/remand dates aren't in the schema. The legally exact 187(3) clock
runs from **first remand**. State this openly; "add arrest-date tracking" is the roadmap item.
Also state that tier thresholds (15/30 days) are configurable operational policy, not law.

**Acceptance criteria (unit tests, fixed `now`):**
- Theft at 50 days → 10 days left, URGENT. At 61 days → OVERDUE.
- Murder at 61 days → 29 days left, WATCH (90-day window, not 60).
- CHARGESHEETED case at 200 days → COMPLIANT.
- Victim-update clock at 80 days → 10 days left.

---

## M7 · AI Chat + Tool Calling 🔵 FRAMEWORK + 🟡

**Purpose:** The conversational core. **The AI must never state a case fact that didn't come from a
tool result.**

### System prompt rules (port these verbatim — they're tuned)
- Answer in the language the officer used (English **or Kannada**).
- **Never state a fact about a case or person without it coming from a tool result;** if tools
  return nothing relevant, say so plainly instead of guessing.
- Never assert a suspect match as certain — always a lead with a confidence %, officer must confirm/reject.
- Ground pattern discussion in method, timing, location, prior record — **never caste, religion, or community.**
- Keep responses concise and operational (bullets, numbered actions).
- Label drafts clearly as DRAFT, not filed.

### Request contract
Client sends `{ message, history[], pageContext, activeCaseId }`.
- `pageContext` — what the officer is currently looking at → injected as a system context block so
  "this case"/"this page" resolves. **This is how feature #3 (context-aware) is satisfied.**
- `activeCaseId` — injected into tool arguments when the model omits a caseId.

### The 15 tools to register
| Tool | Purpose |
|---|---|
| `search_cases` | by crime type / status |
| `get_case_dossier` | full case + persons + matches |
| `run_case_intake` | full intake brief (M2) |
| `find_identity_matches` | identity leads |
| `find_mo_similar_cases` | MO-similar cases |
| `get_investigation_checklist` | 0–72h actions |
| `draft_case_summary` | SP/SHO progress note |
| `suggest_legal_sections` | IPC/BNS framing |
| `update_match_status` | confirm/reject a lead |
| `get_person_connections` | person network |
| `get_similar_cases` | alias for MO-similar |
| `get_hotspot_summary` | station alerts |
| `get_deadline_risks` | ⭐ statutory deadline risks (M6) |
| `fetch_ipc_section` | section text lookup |
| `extract_entities` | phones/vehicle plates from text (regex) |

**Role gating:** CONSTABLE must not get `get_hotspot_summary` or `get_person_connections`.

**Every DB tool receives the RBAC scope** (`effectiveStationId`, `isSp`) — a tool must never
return data outside the officer's jurisdiction.

### Explainability output (feature #8)
Return alongside the reply:
- `toolsUsed: string[]` — which tools ran
- `sources: string[]` — FIR numbers scraped out of the tool results (regex `FIR/...`), max 6
The UI renders these as chips under each answer ("Grounded in records" + tool names + FIR numbers).

### Audit
Write the `CHAT_QUERY` AuditLog row **before** calling the LLM, so failed/errored queries are still
on the record.

**Acceptance criteria:**
- Asking about deadlines triggers `get_deadline_risks` and the answer cites real FIR numbers.
- A Kannada question gets a Kannada answer.
- Chips appear showing the tools used.
- A constable cannot obtain hotspot data through the chat.

---

## M8 · Audit Trail 🟡 + 🔵  (feature #8)

**Purpose:** "Nothing the AI does is off the record." Strong trust signal for police/oversight.

**Logged actions:** `CHAT_QUERY`, `CREATE_CASE`, `FIR_UPLOAD`, `CONFIRM_MATCH`, `REJECT_MATCH`,
`EXPORT_CHAT_PDF`, `EXPORT_CASE_PDF`, `EXPORT_NETWORK_PDF`.

**Client-event endpoint:** PDF exports happen in the browser, so expose `POST /api/audit` that
accepts `{action, targetType, targetId, details}`. **Whitelist the accepted action names** —
never let a client write arbitrary audit rows.

**Viewer page RBAC:**
- CONSTABLE → own actions only
- INSPECTOR → whole station (`officer.stationId` match)
- SP → everything

Show: action badge, officer name + badge + station, details, timestamp. Newest first, cap ~100.

### 🔴 SECURITY NOTE — a real bug found in the original draft
`/api/search` had **no authentication and no station scoping** — anyone, logged out, could pull
case and person records across every station. **When porting, ensure every single API route
checks the session and applies the RBAC scope.** Audit all endpoints for this.

**Acceptance criteria:**
- Ask the copilot something → a row appears in the audit page.
- Export a PDF → a row appears.
- Logging in as constable vs SP shows different row counts.
- No endpoint returns data without a session.

---

## M9 · FIR Intake Flow 🔵 FRAMEWORK

**Purpose:** Turn a scanned FIR (or raw field notes) into a structured case.

**Two input modes:**
1. **Upload** — PDF/image → OCR (Tesseract) → LLM structured extraction.
2. **"Magic Draft"** — officer types rough notes → LLM drafts a professional FIR.

**LLM extracts:** `crimeType, incidentDate, location, accusedNames[], victimName,
narrativeSummary, modusOperandi`. Use structured/JSON-schema output.

**Then, before saving:** show the officer an **editable form** of every extracted field plus
pre-save match leads. Nothing is written until they click Confirm & Save. (Human-in-the-loop.)

**On save (`POST /api/cases`):**
1. Generate `firNumber` = `FIR/<year>/<zero-padded station case count + 1>`
2. **Geocode the location text → lat/long (M4)** ← don't skip; the map depends on it
3. Pack MO into summary via `packSummaryWithMo`
4. Create/reuse Person rows for accused + victim; link via CasePerson
5. **Auto-create `CO_ACCUSED` Connection rows between all pairs of accused on the case**
6. Run `persistIntakeMatches` (M2) → PENDING CaseMatch rows
7. Write `CREATE_CASE` audit row
8. Build the intake brief and return it
9. Client seeds the brief into the copilot chat and redirects to it

**Acceptance criteria:**
- Uploading an FIR produces an editable extracted form.
- Saving creates a case **with coordinates**, and it appears on the hotspot map.
- The copilot opens pre-loaded with the intake brief.

---

## M10 · Network Canvas UI 🔵 FRAMEWORK  ⭐ differentiator

**Purpose:** The investigation workspace. Consumes M5.

**Graph construction (`buildCrimeNetwork(scope)`) 🟡** — from real tables:
- Case node per case (label = FIR number, sub = crime type, date = incident date)
- Person nodes from CasePerson (sub = role, detail = "phone · address")
- **Vehicle nodes by regex-scanning case text for Karnataka plates** `\bKA[-\s]?\d{2}[-\s]?[A-Z]{1,2}[-\s]?\d{1,4}\b`
  (plates aren't a modeled entity — this heuristic surfaces them)
- Location node per station
- Edges: `Accused/Victim/Witness`, `Vehicle used`, `Reported at`,
  `MO match <n>%` (case↔case), `Identity lead <n>%` (case↔person), and person↔person `Connection` types
- **Skip REJECTED CaseMatch rows** — a rejected lead must disappear from the graph
- Deduplicate edges

**UI requirements:**
1. **Expand-on-demand** — start from a searched seed entity, show 1 hop, click a node to expand
   further. *Never render the whole graph.* (Solves the "10,000 cases = unreadable hairball" problem.)
2. **Find-path mode** — pick two entities, highlight the connecting chain.
3. **Detected Rings panel** — click a ring to reveal that cluster.
4. **Key Players panel with Hubs | Brokers toggle.**
5. **Selection panel** — details, and for Case nodes a link to the case dossier.
6. **Evidence Board** — pin entities; export a PDF containing pinned entities + their links + the
   traced chain + a drawn canvas snapshot. Audit-log as `EXPORT_NETWORK_PDF`.
7. **"Brief Copilot"** — compute a brief from graph metrics (in-view counts, top hub, top broker,
   detected ring, traced chain, suggested next actions), push it into the chat, and set page context.
   **Must work with no LLM key** — it's computed, not generated.
8. Node kind filters/legend, node-count chip, search.

**Acceptance criteria:**
- Searching a FIR narrows the canvas to that node.
- Clicking a ring reveals its members.
- Brokers tab ranks differently from Hubs.
- Pin → Export produces a real PDF and an audit row.
- Brief Copilot lands a populated brief in the chat.

---

## M11 · Dashboard / Copilot UI 🔵 FRAMEWORK

Chat interface with:
- Markdown rendering of assistant messages
- **Explainability chips** under each answer (tools used + cited FIRs) — M7
- **Voice input** — Web Speech API `SpeechRecognition`, language `kn-IN` when Kannada is selected, else `en-IN`
- **Voice output (TTS)** — `speechSynthesis`; **auto-detect Kannada** with the Unicode range
  `[ಀ-೿]` and pick a `kn-IN` voice, else `en-IN`. Strip markdown before speaking.
- **PDF export of the conversation** (required feature #4) — title, timestamp, active case, then
  every message labelled OFFICER/COPILOT with page breaks. Audit-log it.
- Suggestion chips; first one should be **"Which cases risk default bail this month?"** (showcases the flagship feature)
- Right rail: real stat cards (total cases, **real** clearance rate, high-risk alerts) + recent cases
- Persist chat + activeCaseId + pageContext in a client store (Zustand + localStorage equivalent)

**⚠️ Gotcha from the original project:** there were **three** chat components, two of which were
dead code never imported. Build exactly one.

---

## M12 · Analytics & Hotspots UI 🔵 FRAMEWORK

- Stat cards, 6-month trend line chart, 7-day risk radar, early-warning feed — all fed by M3.
- Hotspot map + risk ranking list + 7-day sparkline.
- Empty states everywhere (never render a fake chart).
- Label the warning feed honestly — "Data-Driven", not "AI Powered", if it's a heuristic.

### 🗺️ Mapping — use Leaflet + OpenStreetMap, NOT Google Maps
Google Maps throws *"This page can't load Google Maps correctly"* + a "development purposes only"
watermark unless you attach a **billing account**. Leaflet + OSM/CARTO tiles need **no API key and
no billing**, so the map works for every teammate on clone and can't break during judging.
- Theme-aware tiles: CARTO `dark_all` / `light_all`.
- Render clusters as circle markers coloured by intensity, with case-count popups.
- Render only after mount (Leaflet touches `window`).

---

## M13 · Deadlines UI 🔵 FRAMEWORK  ⭐⭐

Page for M6:
- Header explaining the 60/90-day rule in one sentence + the FIR-date caveat.
- 5 summary tiles: Overdue / Urgent / Watch / On track / Charge sheet filed.
- Risk list sorted worst-first: tier chip, FIR link, crime type, "grave · 90-day" badge,
  **elapsed progress bar**, `"FIR day 163 of 60"`, the lapse/countdown line with the statute and
  consequence, victim-update status, and a **"Draft charge sheet"** shortcut.
- Footer citing BNSS 187(3) and 193(3)(ii) and noting the tiers are policy, not law.

---

## M14 · Shared UI Shell 🔵

Sidebar nav (Copilot, Analytics, Hotspots, Cases, Network, **Deadlines**, FIR Intake, **Audit Trail**),
top search, theme toggle, officer identity footer, command palette, design primitives
(Card/Badge/SectionLabel/StatCard/IconOrb), page transitions.

**Gotcha:** any component reading the theme must gate on `mounted` before using `resolvedTheme`,
or you get a React hydration mismatch (this bit us on the network canvas).

---

## M15 · Cases, Dossier, Chargesheet 🔵

**Case list** — filterable by crime type / status / station (SP only), RBAC-scoped.

**Case dossier** (`/cases/[id]`) — the per-case workspace:
- Extracted entities: persons by role, vehicles, location
- **Cross-case matches with Confirm / Reject buttons** → `PATCH /api/cases/[id]/matches`,
  writes `CONFIRM_MATCH`/`REJECT_MATCH` to the audit log. Rejected matches must vanish from the
  network graph (M10 filters them out).
- **AI predicted next steps** (`POST /api/ai/predict-steps`) — LLM reads the dossier and proposes
  prioritised investigative actions, rendered as a checklist. Distinct from the rule-based
  checklist in M2: that one is deterministic per crime type, this one reasons over *this* case's
  specifics. Keep both — rule-based is the reliable fallback when the LLM is unavailable.
- **Intake refresh** (`GET /api/cases/[id]/intake`) — re-run the M2 brief on demand.
- **Draft note** (`POST /api/cases/[id]/draft`) — generate the SP/SHO progress note.

**Chargesheet drafting** (`/cases/[id]/chargesheet` + `POST /api/cases/[id]/chargesheet`) —
assembles a chargesheet draft from the case record. This is the action target of the "Draft charge
sheet" button on the Deadlines page (M13) — wire them together.

**Tactical view** (`/cases/[id]/tactical`) — a full-screen case intelligence report with PDF export
(audit-logged as `EXPORT_CASE_PDF`; **no `Math.random()` in report IDs** — use a timestamp so the
same report is reproducible).

---

# PART 3 — ALGORITHM QUICK REFERENCE (the things that are hard to re-derive)

| Constant | Value | Where |
|---|---|---|
| Name-match threshold | ≥ 0.55 similarity | M2 |
| Phone match score | 95 | M2 |
| Address match | jaccard ≥ 0.4 → 70 + sim×25 | M2 |
| Identity result cap | 8 | M2 |
| MO same-crime-type bonus | +0.15 | M2 |
| MO minimum score | 0.18 (0.12 if same type) | M2 |
| Velocity baseline window | 8 weeks | M3 |
| Velocity risk formula | recent/baseline × 50, clamp 5–99 | M3 |
| Velocity spike alert threshold | risk ≥ 65 AND ≥2 cases | M3 |
| Hotspot grid cell | 0.01° (~1.1 km) | M3 |
| Hotspot intensity | ≥3 high, 2 medium, 1 low | M3 |
| Geocode jitter | ±0.0075° (~0.8 km), deterministic | M4 |
| Graph fetch cap | 60 most recent cases | M10 |
| Ring minimum | ≥2 cases, Location nodes excluded | M5 |
| Betweenness | Brandes, ÷2 for undirected | M5 |
| Charge-sheet clock | 60 days / 90 grave | M6 |
| Victim-update clock | 90 days | M6 |
| Deadline tiers | <0 overdue, ≤15 urgent, ≤30 watch | M6 |
| Kannada detection | Unicode `[ಀ-೿]` | M11 |
| KA plate regex | `\bKA[-\s]?\d{2}[-\s]?[A-Z]{1,2}[-\s]?\d{1,4}\b` | M10 |

---

# PART 4 — CONFIGURATION

```
DATABASE_URL        required  — PostgreSQL
NEXTAUTH_SECRET     required  — session signing (or your stack's equivalent)
NEXTAUTH_URL        required
OPENROUTER_API_KEY  required  — the ONLY external API key needed (chat + FIR extraction)
OPENROUTER_MODEL    optional  — never hardcode a model slug in code
BLOB_READ_WRITE_TOKEN optional — file storage
```
**No maps key needed** (Leaflet/OSM). Everything except the chatbot and FIR AI extraction works
with zero API keys — say this to your team so they can review without any setup.

---

# PART 5 — MASTER FEATURE CHECKLIST

### Required by the hackathon brief
- [ ] 1. NL chatbot, English + Kannada — M7
- [ ] 2. Voice interaction (input **and** output) — M11
- [ ] 3. Context-aware conversations (page context + active case + history) — M7
- [ ] 4. PDF export of conversation history — M11
- [ ] 5. Criminal network visualization — M5, M10
- [ ] 6. Crime trend & hotspot detection — M3, M12
- [ ] 7. Predictive analytics & early warnings — M3
- [ ] 8. Explainable AI with audit trails — M7 chips, M8 audit
- [ ] 9. Role-based secure access — M1, enforced in every module

### Differentiators (the winning margin)
- [ ] 10. **Statutory Deadline Tracker / Default-Bail Shield** — M6, M13 ⭐⭐
- [ ] 11. Deadline risks queryable via the copilot (`get_deadline_risks`) — M7
- [ ] 12. Deadline breaches in the early-warning feed — M3
- [ ] 13. **Crime ring detection** — M5
- [ ] 14. **Broker (betweenness) ranking vs hubs** — M5
- [ ] 15. **Path-finding between entities** — M5, M10
- [ ] 16. **Expand-on-demand graph** (scales past the hairball) — M5, M10
- [ ] 17. **Evidence board + court-ready network PDF** — M10
- [ ] 18. **Brief Copilot from graph metrics** (works without LLM) — M10
- [ ] 19. Rule-based intake brief (identity + MO + legal + checklist) — M2
- [ ] 20. Deterministic SP/SHO note drafting without an LLM — M2
- [ ] 21. Offline geocoding of FIR locations — M4
- [ ] 22. Confirm/reject workflow on every AI-suggested link — M2
- [ ] 23. AI predicted next steps on the case dossier — M15
- [ ] 24. Chargesheet drafting, wired to the Deadlines page CTA — M13, M15
- [ ] 25. Tactical case intelligence report + PDF — M15
- [ ] 26. Command palette / global search (RBAC-scoped) — M14

### Correctness / hygiene (fixes from the original draft — don't reintroduce)
- [ ] 27. Every dashboard number comes from the DB (no hardcoded arrays, no `Math.random()`)
- [ ] 28. Every API route is session-checked and RBAC-scoped
- [ ] 29. FIR location is geocoded on save (else new cases never hit the map)
- [ ] 30. Maps work without an API key (Leaflet)
- [ ] 31. Model IDs come from env, never hardcoded
- [ ] 32. No dead/duplicate components
- [ ] 33. Theme-dependent components gate on `mounted` (no hydration mismatch)
- [ ] 34. Chat query audited *before* the LLM call, so failures are recorded

---

# PART 6 — IMPLEMENTATION ORDER

**Phase 1 — Foundation**
1. Data model + migrations (Part 1)
2. Seed script (must produce overdue cases, a recent spike, and shared persons)
3. M1 Auth + RBAC scope helper

**Phase 2 — Pure logic (no UI; unit-test each) 🟢**
4. M5 Graph engine
5. M6 Compliance engine
6. M4 Geocoder
7. M2 similarity/legal/checklist primitives
> These are stack-independent. Port them first — they're the intellectual core and fully testable.

**Phase 3 — Data layer 🟡**
8. M2 intake engine (queries + persistence)
9. M3 analytics engine
10. M10 graph builder
11. M6 compliance board queries

**Phase 4 — APIs 🔵**
12. M7 chat + 15 tools
13. M9 FIR intake endpoints
14. M8 audit endpoint
15. Cases/search endpoints — **session + scope on every one**

**Phase 5 — UI**
16. M14 shell + nav
17. M11 dashboard/copilot (chat, voice in/out, PDF, chips)
18. M12 analytics + hotspots (Leaflet)
19. M13 deadlines
20. M10 network canvas
21. M8 audit viewer
22. M15 cases/dossier/chargesheet
23. M9 FIR intake UI

**Phase 6 — Verification**
24. Walk Part 5 checklist end to end
25. Type-check + production build
26. Full demo rehearsal (below)

---

# PART 7 — DEMO SCRIPT (what to show judges)

1. **Deadlines** — "If police miss the 60-day charge-sheet window, the accused gets bail
   automatically. This tracks every case's legal clock." Point at an overdue case.
2. **FIR Intake** — upload/draft an FIR, show AI extraction, confirm & save.
3. **Intake brief** in the copilot — identity leads with confidence %, MO-similar cases, legal
   sections, 24h checklist. Confirm one lead, reject another.
4. **Network** — reveal a detected ring, switch Hubs→Brokers, trace a path, pin to the evidence
   board, export the PDF.
5. **Analytics** — trend, forecast, early warnings including default-bail risks.
6. **Kannada + voice** — ask a question by voice in Kannada, play the answer back.
7. **Audit Trail** — "every one of those actions is on the record."

**Opening line for a police audience:** *"Nothing this system says is filed until an officer
confirms it."*
**Closing line:** *"Other systems tell you what crime happened. Sahayak tells you which of your
own cases will collapse in court next week — before it happens."*

---

# PART 8 — KNOWN CAVEATS (be upfront; judges respect honesty)

1. **Deadline clocks anchor to FIR date**, not arrest/remand. Legally exact clock runs from first
   remand. Roadmap: arrest-date tracking.
2. **"Predictive analytics" is a rate-of-change heuristic**, not a trained model. Defensible and
   explainable — never claim ML you don't have.
3. **Kannada UI chrome** used the Google Translate widget, which mangles domain terms
   ("chargesheet", IPC section names). The **chatbot** generates Kannada natively via the LLM —
   that's the part that matters. Consider proper i18n instead of Translate in the new build.
4. **Graph capped at 60 recent cases** per view. Architecture separates pure math from data fetch
   so it can run on a time-windowed or precomputed slice at real scale.
5. **Vehicles are regex-extracted**, not a modeled entity. Consider a real Vehicle table.
6. **Gazetteer geocoding is approximate** (~30 localities + jitter). Swap for a real geocoder if
   one becomes available.
