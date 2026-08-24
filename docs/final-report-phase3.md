# Final-report builder Phase 3

Phase 3 separates reusable investigation facts from one final-report working
copy. It remains deterministic and does not send report data to an AI service.

## Case-level source workspace

The **Report Data** case tab stores:

- case-party identity/profile fields, complainant selection and accused outcome;
- accused chronology (identification, arrest, Court forwarding, bail and related events);
- FIR-to-final legal-section decisions with reasons;
- seized/recovered property;
- expert/forensic results and linked documents; and
- analysis outcomes for existing case evidence.

Each save checks case-person, evidence and document ownership, assigned-IO
permission, contradictions and an optimistic revision number. Impossible source
links are rejected. Legal or chronology omissions remain visible as validation
issues instead of being fabricated.

## Final-report refresh boundary

Initializing a new report imports the current source values. An existing editable
draft changes only when an officer selects **Refresh case data**. Refresh:

1. fills empty or `NOT_RECORDED` fields;
2. adds newly recorded legal, property and expert-result records;
3. preserves non-empty officer-authored fields;
4. creates an immutable `SOURCES_REFRESHED` version; and
5. refuses stale revisions or reports locked for review/approval.

Saving report-source data by itself never mutates an existing final-report
version. Approved historical snapshots are not upgraded or rewritten.

## Deployment boundary

Apply migration `0012_case_report_sources.sql` only to the isolated test database
for this checkpoint. The original shared round-one database remains unchanged.
