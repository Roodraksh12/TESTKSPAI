# Final-report builder Phase 2

## Goal

Build an officer-controlled final-report working copy from existing case records,
using deterministic mappings and explicit human verification. Report content is
not sent to an external AI service.

The Rajasthan IIF-IV documents supplied for development are a reference profile,
not a claim that the generated packet is a notified Karnataka form. A Karnataka
profile can reuse the same canonical payload after an authoritative specimen is
available.

## Compatibility boundary

- Phase 1 payloads remain readable.
- An editable schema-v1 draft is upgraded in memory and becomes schema v2 only
  when an officer saves it as a new immutable version.
- Approved and filed historical snapshots are not rewritten.
- Existing case, diary, evidence, custody-clock, deadline, network and auth tables
  are not repurposed.
- The source-linked person, evidence and document identifiers are re-resolved in
  the jurisdiction-scoped case on every save.

## Schema-v2 sections

1. Filing metadata: template profile, legal regime, final-report number/date,
   original or supplementary category, receiving Court and filing place.
2. Read-only case snapshot: FIR, station, district, incident/report dates, current
   IO and case summary.
3. Complainant/informant and selected victims.
4. Accused: charge-sheeted and not-charge-sheeted disposition, allegation,
   identity verification, parent/alias/demographics, addresses, arrest/remand,
   Court forwarding, bail/sureties and prior-record references.
5. Legal provisions: FIR-stage presence, retained/added/dropped final decision,
   reason and supervisory reference, plus accused-to-section facts and sources.
6. Witnesses, case evidence and result annotations.
7. Seized/recovered property and medical, forensic, CCTV or electronic results.
8. Ordered annexure index with serial, annexure number, category, copy status and
   page count.
9. Officer-authored investigation narrative, validation explanations,
   declaration and supervisory workflow.

## Validation principles

- Missing filing number/date/Court, complainant, accused allegation, final legal
  decision, matrix facts, core narrative or declaration blocks submission.
- Legitimately absent victims, evidence, documents or property require an officer
  explanation instead of fabricated placeholder data.
- Dropped sections and non-charge-sheeted accused require recorded reasons.
- Annexure order and annexure numbers must be unique.
- Manual legal entries are visibly marked for authoritative statute verification.

## Delivery checkpoints

1. Canonical schema-v2 payload, migration constraints and backward-compatible
   upgrade path.
2. Structured editor controls and server validation.
3. Deterministic PDF schedules in saved annexure order.
4. Fixture-based mapping tests using redacted representations of the supplied
   FIR/final-report patterns.
5. Karnataka template mapping after an authoritative blank or completed specimen
   is supplied and reviewed by the intended police/legal users.
