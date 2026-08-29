# Phase 0 regression baseline

This checklist protects the working hackathon prototype while correctness fixes are introduced. All development and database verification must use the isolated test environment, never the original shared database.

## Automated gates

- Backend unit suite: `cd backend && .venv/bin/python -m pytest app/tests -q`
- Database integration suite: `cd backend && .venv/bin/python -m pytest app/tests/test_network_integration.py app/tests/test_analytics_integration.py app/tests/test_deadline_board_integration.py -q`
- Frontend lint: `cd frontend && npm run lint`
- Frontend type check: `cd frontend && npm run typecheck`
- Frontend production build: `cd frontend && npm run build`

Baseline before Phase 1:

- 141 backend tests pass; database-dependent tests are skipped by the unit run.
- 12 selected database integration tests pass against the cloned test database.
- Frontend lint and production build pass.
- The two existing ES2020 `replaceAll` type errors are removed as part of the Phase 0 gate.

## Browser regression checklist

1. Sign in with the documented demo SP account.
2. Confirm the dashboard eventually shows 32 cases, 31 open investigations, and the permitted district scope.
3. Reload Cases and confirm all 32 demo cases remain visible.
4. Open `FIR/2026/EXTRA-110` and verify Overview, Case Diary, Investigation Plan, Report Data, Connections, Evidence, and Matches still open.
5. Confirm the Case Diary groups entries by local date and restarts page numbering at 1 for each date.
6. Open Final Report and confirm the existing saved draft and validation state load without mutation.
7. Open Deadlines and confirm custody clocks are described as per accused and remand-based.
8. Open Network and confirm pan, zoom, node selection, verified links, and unverified-lead separation.
9. Open Analytics, Hotspots, and Early Warnings and verify loading, empty, error, and populated states do not contradict one another.
10. Confirm no browser console errors other than the separately tracked external-AI provider failure.

## Change rules

- Use additive database migrations only.
- Keep existing API response fields during Phase 1; new fields must be optional for older clients.
- Do not infer a custody deadline from FIR registration, arrest, suspect identification, or crime label.
- Do not erase successfully loaded data during a background refresh failure.
- Do not label manual or legacy alerts as statistical early-warning detections.
- Stop after each Phase 1 group and rerun the relevant automated and browser checks.
