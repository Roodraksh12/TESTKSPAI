# Case dossier and investigation record

## Current implementation

The React route `/cases/:id` loads a jurisdiction-checked case from FastAPI. The
dossier provides:

- overview and timeline;
- protected Original FIR viewing/download where a source scan was retained;
- date-grouped case diary with per-day page numbering and range PDF export;
- investigation plan and provisional routine-document drafts;
- structured report data and officer-controlled final-report workflow;
- recorded connections, evidence and reviewable matches;
- per-accused custody/remand clocks.

## Data and authorship rules

Formal report generation is deterministic and does not ask an external model to
invent filing content. Refresh operations fill missing fields from saved source
records without overwriting officer edits. Approved report versions are
immutable.

New people are never merged across cases from a matching name alone. The
suggestion engine also requires corroborating recorded information (currently a
phone or address alongside the name), excludes same-case-only records, and
creates only a pending lead. An officer must confirm it before it becomes a
cross-case connection.

Diary attachments are stored durably in the test database after migration 0019,
with jurisdiction-checked downloads and audit events. A police-scale deployment
should move binaries to an approved encrypted object store while retaining the
same API authorization boundary.
