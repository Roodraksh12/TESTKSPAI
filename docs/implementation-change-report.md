# SCRB Sahayak — Implementation Changes 1–5

**Checkpoint date:** 26 August 2026

**Target:** isolated hackathon/test environment

**Production claim:** none. This is a tested prototype checkpoint, not a certified police deployment.

## 1. Executive status

| Change | Outcome | Status |
|---|---|---|
| 1 | Remove hard dependency on OpenRouter | Implemented and tested |
| 2 | Ground conversational answers in authorised crime records | Implemented and tested |
| 3 | Prepare for approximately 30 lakh records | Architecture assessment and implementation plan only |
| 4 | Add structured investigation guidance and routine-document drafts | Implemented as a provisional, deterministic demo |
| 5 | Reduce external-AI data exposure and make AI use auditable | Implemented and tested; live model choice remains a deployment decision |

The original shared round-one database was not migrated or modified. Database
migrations 0013 and 0014 were applied only to the separate test clone.

## 2. Change 1 — provider-neutral AI gateway

### Problem

AI features called OpenRouter directly. An API outage, model removal, policy
change or future department requirement for on-premises inference would have
required changes across multiple routes.

### Implementation

- Added one backend gateway in `backend/app/services/llm_gateway.py`.
- Preserved the existing completion, JSON-response and tool-call contracts so
  callers and the frontend did not need provider-specific branches.
- Kept OpenRouter as a supported development provider.
- Added an OpenAI-compatible option for an approved private or self-hosted
  endpoint.
- Added provider validation, timeouts and safe provider-error handling.
- Kept all provider credentials on the backend.
- Added unit tests for provider selection, URL normalisation, authentication,
  tool calls, errors and configuration rejection.

### Configuration

Development through OpenRouter:

```dotenv
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...
```

Approved private endpoint:

```dotenv
AI_PROVIDER=openai_compatible
AI_BASE_URL=http://approved-host:port/v1
AI_MODEL=approved-model
AI_API_KEY=
AI_PRIVATE_ENDPOINT=true
```

`AI_PRIVATE_ENDPOINT=true` is a trust declaration, not an automatic security
feature. It must be set only when the endpoint is actually inside a reviewed
private boundary.

### Why this design

The application depends on a small, stable chat-completions interface instead
of a particular model vendor. This is less risky than letting every feature
choose and call a provider independently.

### Benefits

- OpenRouter can be replaced without a frontend rewrite.
- A local model, government cloud endpoint or department-hosted service can use
  the same application flow.
- Provider policy is enforced in one place.
- Existing AI routes continue to use the same response shape.

### Costs and limitations

- A replacement endpoint must support the OpenAI-compatible chat-completions
  schema and, for the conversational assistant, tool calling.
- Model quality and tool-call reliability will vary across providers.
- Moving to a private model transfers availability, patching, evaluation and
  capacity responsibility to the deployment owner.
- Provider neutrality does not by itself make external processing safe; Change
  5 adds the privacy policy.

## 3. Change 2 — grounded conversational crime-data queries

### Problem

The assistant could discuss a case, but broad requests such as “find open
burglary cases” or “show the monthly trend” needed verified database results,
not model memory or arithmetic over a short list.

### Implementation

- Added deterministic query functions in
  `backend/app/services/crime_queries.py`.
- Added separate read-only AI tools for:
  - case search; and
  - crime statistics and grouped breakdowns.
- Supported filters for FIR, crime type, status, station, district, person,
  person role and incident-date ranges.
- Supported fixed time windows and grouping by crime, status, station,
  district, month, weekday and hour.
- Applied the existing officer-jurisdiction filter inside every database query.
- Used parameterised SQL and strict enums/date validation.
- Limited case lists to 25 and aggregate rows to 50.
- Made the model use the aggregate tool for totals instead of counting a
  truncated case-search result.
- Returned source case IDs and FIR numbers so grounded case chips open the
  correct dossier. If an ID is unavailable, the link falls back to a filtered
  case-directory search.
- Hid suggested prompts while a request is loading.
- Added tests for date boundaries, filtering, grouping, limits, jurisdiction
  scope, explainability metadata and navigable sources.

### Why this design

The model interprets the officer’s natural-language intent, but the backend
chooses the allowed query shapes and the database calculates the answer. The
model is never given unrestricted SQL access.

### Benefits

- Results are grounded in records visible to the signed-in officer.
- Exact counts are computed by PostgreSQL.
- The model cannot bypass jurisdiction by inventing SQL.
- A user can move from an answer to its source case.
- English/Kannada conversation remains a presentation layer over deterministic
  queries.

### Costs and limitations

- Only the implemented filters and groupings are supported.
- The model can still choose the wrong tool or misunderstand an ambiguous
  question; visible sources and officer review remain necessary.
- The prototype does not yet expose a formal semantic metric catalogue, so
  terms such as “repeat offender” need an approved definition before adding
  them as official metrics.
- Complex cross-case graph questions still need a separately designed graph
  query service.

## 4. Change 3 — 30-lakh-record scale readiness

### Honest status

This change is **not implemented as a production-scale data platform**. The
current architecture has useful foundations, but it has not been benchmarked
with 30 lakh cases or official CCTNS/ICJS traffic. It should be presented as a
scale plan, not as a completed capability.

### What is already compatible

- The frontend never connects directly to PostgreSQL.
- All database access is server-side and jurisdiction-scoped.
- Query inputs are parameterised and bounded.
- Case lists use limits instead of loading the entire database.
- Exact statistics are calculated in SQL rather than in the browser or LLM.
- AI receives only the small result needed for the current question.

### Current bottlenecks at 30 lakh cases

- Broad `ILIKE '%text%'` searches can become expensive without trigram or
  full-text indexes.
- Some person filters and per-case subqueries need execution-plan review at
  production cardinalities.
- Recomputing dashboard aggregates from transactional tables will compete with
  operational traffic.
- Offset-style browsing becomes slow and unstable at deep pages; keyset
  pagination is preferable.
- Dense network construction cannot load every person/case edge into one API
  response or browser graph.
- A single transactional database is not an analytics, search and graph engine
  at the same time.
- There is no production ingestion/CDC pipeline, replica strategy, load test,
  query budget or measured service-level objective yet.

### Proposed production path

1. Obtain an anonymised schema, cardinalities, data-quality profile and the top
   officer query patterns from the department.
2. Define service-level targets for interactive search, aggregates, graph
   expansion and batch reports.
3. Add indexes from measured query plans: composite B-tree indexes for common
   scope/date/status access, trigram/full-text indexes for names/FIR/searchable
   narratives, and appropriate indexes on link tables.
4. Replace deep offset pagination with cursor/keyset pagination.
5. Send read-heavy conversational queries to read replicas.
6. Build reviewed materialised summaries or an analytics store for repeated
   district/station/time aggregates.
7. Use a dedicated search index only if PostgreSQL full-text/trigram search does
   not meet the measured target.
8. Build a bounded graph projection or graph service for link analysis; expand
   from a selected entity with server-side node/edge budgets.
9. Add CDC/batch ingestion, idempotency, reconciliation, data lineage and
   back-pressure.
10. Add query timeouts, rate limits, caching of non-sensitive aggregates,
    tracing and slow-query alerts.
11. Generate a synthetic dataset at representative scale and run concurrency,
    failover and recovery tests before claiming readiness.

### Inputs required from police/IT

- Official or anonymised table/data-contract samples.
- Expected row counts for cases, people, vehicles, documents and links.
- Required query catalogue and definitions of each operational metric.
- Jurisdiction and row-level access rules.
- Freshness targets: real time, minutes, hourly or daily.
- Peak concurrent officers and acceptable response times.
- Hosting, network, residency, backup and disaster-recovery constraints.
- Data-retention and deletion policy.

### Benefits of the proposed path

- Scales each workload independently.
- Keeps the LLM away from unrestricted raw-database access.
- Supports measurable performance claims.
- Allows gradual adoption instead of a high-risk database rewrite.

### Costs and tradeoffs

- More infrastructure and operational ownership.
- Search/analytics replicas introduce synchronisation and freshness tradeoffs.
- Materialised aggregates require carefully defined metrics and refresh logic.
- A graph projection consumes additional storage and must preserve jurisdiction
  rules.
- Production confidence requires representative data and load testing; it
  cannot be inferred from the 30-case demo.

## 5. Change 4 — provisional investigation plan and routine-document drafts

### Problem

The earlier “next actions” response was short and model-generated. The field
feedback described a more useful system: a complete, repeatable checklist with
small routine applications/drafts, officer control and native-language support.
Official Karnataka procedures and forms were not available.

### Implementation

- Added migration `0013_investigation_playbooks.sql` to the isolated test
  database.
- Added versioned per-case plan snapshots, task status/notes and routine-document
  draft records.
- Added a versioned JSON registry in
  `backend/app/data/investigation_playbooks.demo.json`.
- Marked the entire starter registry `PROVISIONAL_DEMO` and display its
  disclaimer in the UI.
- Composed a plan from common steps plus a matched crime profile.
- Grouped tasks into initial review, early actions, follow-up and supervisory
  review phases.
- Supported pending, in-progress, completed, blocked and not-applicable status.
- Restricted updates to an authorised case writer and, when assigned, the
  current Investigating Officer.
- Added a transaction/advisory lock so repeated initialisation cannot create a
  partial or duplicate plan.
- Logged plan, task and document-draft changes in the existing audit system.
- Generated routine-document drafts deterministically from verified case fields
  plus required officer input. No LLM is used for this generation.
- Allowed draft editing, but deliberately did not add signing, approval, filing,
  sending or automatic external communication.
- Added a case-dossier Investigation Plan tab and backend tests.

### Why this design

Department-approved procedures should be versioned rules, not hidden prompt
text or model memory. Existing case plans keep the exact registry version they
started with, so later template updates do not silently rewrite an investigation
record.

### Benefits

- Predictable workflow with visible completion state.
- Minimal AI dependency.
- Human ownership and an audit trail.
- Safe to replace provisional content with reviewed departmental versions.
- Routine text is reproducible from the same inputs.

### Costs and limitations

- The current tasks and draft formats are not official Karnataka Police forms
  or standing orders.
- The plan is useful only after domain experts review completeness, ordering,
  permissions and exception handling.
- No native-language official templates have been supplied.
- There is no workflow to transmit documents, by design.
- Formal process changes require a new reviewed registry version and migration/
  release process.

### New inputs required

- Official offence-wise SOP/checklist material.
- Official application, requisition and report formats.
- Mandatory/optional fields and signatory/approval rules.
- Language-approved Kannada versions.
- Event triggers, statutory time limits and escalation rules.
- Confirmation of which records may be generated, sent or integrated with
  external systems.

## 6. Change 5 — privacy-controlled AI processing

### Threat being addressed

Police case prompts can contain names, FIR numbers, phone numbers, addresses,
vehicle registrations and case narratives. Sending that content unchanged to a
foreign or unapproved model provider is not acceptable for a real deployment.

### Implementation

#### A. Local, reversible tokenisation

- Every external LLM request passes through
  `backend/app/services/ai_privacy.py`.
- Known case values and structured fields are tokenised before egress.
- Additional local rules cover common Indian phone numbers, email addresses,
  Aadhaar-like numbers, FIR references, KSP badge identifiers, vehicle
  registrations, IP addresses, labelled names/addresses and English/Kannada
  name contexts.
- A temporary map such as `Anitha B -> [PERSON_1]` exists only in memory for one
  request.
- The provider works with tokens. The backend restores the original value in
  response text and tool-call arguments before the application uses it.
- The temporary map is never written to a database or log.

#### B. Central policy enforcement

- External processing is allowed only in `redacted_only` mode.
- `AI_EXTERNAL_MODE=disabled` blocks all external model calls.
- An OpenAI-compatible endpoint is blocked unless it is explicitly marked as an
  approved private endpoint.
- A maximum outbound character budget blocks unexpectedly large context.
- Input/history/context limits bound request size before provider processing.
- All current LLM call paths use the gateway: conversational chat, field-note
  extraction, FIR/OCR extraction, legal relevance and suggested next steps.

#### C. Zero Data Retention routing

- Every OpenRouter request includes `provider: {"zdr": true}`.
- If the chosen model has no ZDR route, the request fails closed. It does not
  retry through a retaining provider.
- OpenRouter documents that request-level ZDR restricts routing to ZDR endpoints
  and publishes a live endpoint list. Endpoint availability is external and can
  change.

#### D. Read-only AI tools

- Removed the AI tool that could confirm/reject an identity match.
- AI database tools are now read-only.
- Manual Confirm/Reject actions remain available through the reviewed case UI
  and existing authorised API.

#### E. Metadata-only privacy audit

- Added migration `0014_ai_privacy_audit.sql`.
- `AiRequestAudit` stores officer/session/purpose, provider/model, processing
  mode, ZDR flag, redaction categories/counts, egress size, case/tool references,
  status, latency and error class.
- It stores keyed HMAC request/response fingerprints for correlation.
- It has no prompt, completion, narrative, name or token-map column.
- Assistant messages can store safe privacy-display metadata separately from
  their already existing conversation content.
- `AI_PRIVACY_AUDIT_REQUIRED=true` makes a controlled deployment fail when the
  privacy audit cannot be written. The default stays migration-compatible for
  local development.

#### F. Retention and user transparency

- Added a dry-run-by-default chat-history purge command controlled by
  `AI_CHAT_RETENTION_DAYS`.
- Added UI labels for “Sanitised external AI” versus “Private model,” provider,
  model, ZDR/private-boundary policy, redaction category counts and processing
  timings.
- The normal “Grounded in records” label appears only when a database tool or
  source was actually used.

### Live configuration result at this checkpoint

- The previously selected free Nemotron model returned no route matching the
  enforced ZDR policy. This is the expected safe failure.
- On 26 August 2026, OpenRouter's public endpoint list showed one free,
  tool-capable ZDR route: `z-ai/glm-5.2:free` through Decart.
- A synthetic-only smoke test of that route returned HTTP 429 because free
  provider capacity was unavailable. No case or police data was used.
- The active environment was not silently changed. The team must choose between
  an available paid ZDR route, retrying the unreliable free route, or an
  approved private model endpoint.

Current ZDR/tool/structured-output shortlist from the official endpoint list
(26 August 2026; availability and prices can change):

| Model | Cheapest listed ZDR route | Listed input/output price per 1M tokens | Comment |
|---|---|---:|---|
| `z-ai/glm-5.2:free` | Decart | $0 / $0 | Returned 429 in both synthetic smoke tests, including with the supplied key |
| `ibm-granite/granite-4.1-8b` | CoreWeave | $0.05 / $0.10 | Synthetic automatic tool-call test succeeded |
| `openai/gpt-oss-20b` | CoreWeave | $0.03 / $0.13 | Synthetic text call succeeded, but automatic tool selection did not |
| `mistralai/mistral-small-3.2-24b-instruct` | DeepInfra | $0.075 / $0.20 | Synthetic request returned 429 |

This is a routing shortlist, not a quality recommendation. Only synthetic data
was used. The paid candidate smoke calls made before the user clarified that the
key should be used only for GLM 5.2 Free may have consumed a very small amount of
OpenRouter credit; no further paid test was made after that clarification.

### Performance impact

- Local tokenisation is an in-process text pass. The API reports its measured
  `privacyProcessingMs`; it does not add another network request.
- Metadata audit currently adds a small database insert and completion update
  per model hop.
- Tool-using conversations can have multiple model hops, so they create multiple
  audit events and the provider remains the dominant latency.
- ZDR reduces the eligible provider pool. This can increase provider latency or
  produce a safe availability failure, as seen with the free route.
- The retention purge runs as an operator task, not in the request path.
- No production latency claim has been made; representative load tests are still
  required.

### Benefits

- Reduces the amount of directly identifying information sent externally.
- Prevents a silent fallback to an endpoint with weaker retention.
- Gives officers visible processing-mode information.
- Provides auditable metadata without duplicating raw case text in an AI log.
- Keeps write decisions under officer control.
- Supports a later move to a private model without rewriting application routes.

### Limitations and residual risks

- Rule-based tokenisation is defence in depth, not certified de-identification.
  Arbitrary narrative, spelling variations, OCR errors and indirect identifiers
  can evade detection.
- Kannada and other Indian-language PII recognition needs a reviewed corpus and
  custom recognisers before operational use.
- Even de-identified facts can sometimes be re-identifying when combined.
- The model provider still sees the sanitised prompt structure and non-redacted
  facts.
- ZDR is a provider policy/routing control, not proof of data residency or an
  on-premises trust boundary.
- A model can mishandle placeholder tokens or produce an incorrect answer.
- Saved local chat content still contains the officer's original text until the
  retention task removes it.
- HMAC fingerprints are safe only while the application secret is protected and
  rotated under an approved key-management policy.
- Prompt injection and model-quality risks are reduced by read-only, scoped
  tools but are not eliminated.

### Production hardening still required

1. Prefer a department-hosted or contractually approved private model boundary
   for real case data.
2. Add an independent DLP/PII layer with custom India/Karnataka recognisers and
   a false-negative evaluation set. Microsoft Presidio is one possible building
   block, but its own documentation warns that automated PII detection cannot
   guarantee complete discovery.
3. Add mTLS/private networking, secrets in KMS/HSM, rotation and egress allowlists.
4. Schedule and monitor the retention purge; define legal holds and deletion
   exceptions.
5. Restrict access to privacy audit views and alert on failures/anomalies.
6. Run prompt-injection, data-leakage, red-team and multilingual evaluations.
7. Complete a departmental security/privacy/legal review and data-processing
   agreement before any live use.
8. Consider confidential-computing/TEE deployment only as an additional control.
   A TEE can protect data in use and provide attestation, but it does not replace
   application access control, model evaluation, redaction or provider approval.

## 7. Verification report

### Automated checks

- Full backend suite: **169 passed** against the isolated test database.
- Focused privacy/database suite: **28 passed**.
- Privacy-focused no-database run: **26 passed, 2 skipped**.
- Frontend lint: passed.
- Frontend production build: passed.
- Migration 0014: applied successfully to the test clone only.

Covered behaviours include provider switching, ZDR request payloads,
tokenisation/restoration, structured case fields, English/Kannada detection,
egress limits, disabled external mode, untrusted-endpoint blocking,
metadata-only audit writes, audit-failure policy, chat privacy persistence,
grounded sources and read-only AI tools.

### Live synthetic checks

- Existing Nemotron free route: safely rejected because no endpoint matched ZDR.
- Current GLM 5.2 free ZDR/tool route: safely reached policy-compatible routing
  but was rate-limited with HTTP 429, including with the user-supplied key.
- The supplied key authenticated successfully on synthetic requests. Granite's
  automatic tool call succeeded; GPT-OSS returned text but did not automatically
  select the requested tool; the Mistral route returned 429.
- No real case, officer, victim, accused or police data was sent in either test.

### Manual test checklist for the team

1. Apply migrations through 0014 only to the isolated test database.
2. Start backend and frontend with a ZDR-compatible model or approved private
   endpoint.
3. Sign in with a seeded test officer.
4. Ask for open burglary cases; verify suggestions disappear during loading.
5. Verify returned FIR chips open the relevant case dossier.
6. Ask for counts by status/month; verify the response says it is limited to the
   officer's jurisdiction.
7. Ask about a synthetic person/phone/FIR; verify the privacy chips report
   redaction categories without displaying the values in audit metadata.
8. Inspect `AiRequestAudit`; verify there are no prompt/completion columns.
9. Set `AI_EXTERNAL_MODE=disabled`; verify AI fails but deterministic case,
   diary, deadline, network, report and investigation-plan pages still work.
10. Preview `python -m scripts.purge_ai_history`; use `--apply` only in a test
    environment where deletion is intended.

## 8. Deployment choices the team must make

| Decision | Hackathon-safe default | Production direction |
|---|---|---|
| Model hosting | Sanitised synthetic/demo data plus enforced ZDR | Approved private/on-prem model boundary |
| Free model | Accept possible 429/availability failure | Do not depend on an uncontracted free endpoint |
| Audit failure | Optional during rolling local migration | Required after migration/monitoring is ready |
| Chat retention | 30-day test default | Department-approved schedule and legal holds |
| Playbooks/forms | Clearly labelled provisional demo | Versioned, department-reviewed official material |
| Scale claim | Architecture plan only | Representative 30-lakh load test and SLO evidence |
| AI write access | None | Keep human approval; add only reviewed, narrow commands if ever required |

## 9. New requirements introduced

- Migration 0014 in the isolated test database.
- A ZDR-capable, tool-capable OpenRouter model **or** an approved private
  OpenAI-compatible endpoint.
- An operator schedule for chat-history retention in any persistent deployment.
- Official playbooks/forms before presenting Change 4 as operational procedure.
- An anonymised production-scale dataset and query workload before claiming
  Change 3 readiness.
- No new Python or npm package was required for Change 5; the initial local
  tokeniser intentionally uses the existing runtime.

## 10. Earlier product work retained in this checkpoint

The numbered changes build on earlier tested work: persistent case-directory
loading, movable/zoomable network canvas, Tactical View removal, date-wise case
diary numbering and range PDF export, per-accused BNSS custody clocks, statutory
deadline explanations, deterministic final-report builder/source records, and a
more operational early-warning page. Those workflows remain independent of the
external AI provider.

## 11. Reference material

- [OpenRouter — Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr)
- [OpenRouter — live ZDR endpoint list](https://openrouter.ai/api/v1/endpoints/zdr)
- [OpenRouter — provider logging and data policies](https://openrouter.ai/docs/guides/privacy/provider-logging/)
- [Microsoft Presidio — supported PII entities and custom recognisers](https://microsoft.github.io/presidio/supported_entities/)
- [Microsoft Presidio — limitations and defence-in-depth warning](https://microsoft.github.io/presidio/)
- [Google Confidential Computing — remote attestation overview](https://docs.cloud.google.com/confidential-computing/confidential-vm/docs/attestation-overview)
