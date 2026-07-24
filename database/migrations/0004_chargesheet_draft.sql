-- Charge-sheet drafting support.
--
-- The API (GET/PUT /api/cases/{id}/chargesheet and POST .../chargesheet/generate)
-- reads and writes Case."chargesheetDraft", but the column was never declared in
-- 0003, so every one of those endpoints failed with a 500 and the "Draft charge
-- sheet" button on the Deadlines board did nothing.
--
-- Nullable by design: a case has no draft until an officer generates one, and an
-- absent draft is meaningful (nothing has been prepared yet) rather than an
-- error state. Nothing here is filed — the draft is working material the officer
-- edits and signs off before it becomes a real charge sheet.

ALTER TABLE "Case"
  ADD COLUMN IF NOT EXISTS "chargesheetDraft" TEXT;
