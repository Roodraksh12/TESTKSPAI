-- Phase 2 canonical final-report payload contract.
--
-- The complete working copy remains JSONB because every immutable version must
-- preserve the exact officer-reviewed document. These constraints and indexes
-- make the new structured sections enforceable and queryable without splitting
-- one legal snapshot across mutable child rows.

ALTER TABLE "FinalReport"
  DROP CONSTRAINT IF EXISTS "FinalReport_payload_object_check";
ALTER TABLE "FinalReport"
  ADD CONSTRAINT "FinalReport_payload_object_check"
  CHECK (jsonb_typeof(payload) = 'object');

ALTER TABLE "FinalReport"
  DROP CONSTRAINT IF EXISTS "FinalReport_payload_schema_version_check";
ALTER TABLE "FinalReport"
  ADD CONSTRAINT "FinalReport_payload_schema_version_check"
  CHECK (
    NOT (payload ? 'schemaVersion')
    OR (payload ->> 'schemaVersion') ~ '^[1-9][0-9]*$'
  );

ALTER TABLE "FinalReport"
  DROP CONSTRAINT IF EXISTS "FinalReport_phase2_shape_check";
ALTER TABLE "FinalReport"
  ADD CONSTRAINT "FinalReport_phase2_shape_check"
  CHECK (
    COALESCE(payload ->> 'schemaVersion', '1') <> '2'
    OR (
      jsonb_typeof(payload -> 'reportMetadata') = 'object'
      AND jsonb_typeof(payload -> 'complainant') = 'object'
      AND jsonb_typeof(payload -> 'victims') = 'array'
      AND jsonb_typeof(payload -> 'accused') = 'array'
      AND jsonb_typeof(payload -> 'offences') = 'array'
      AND jsonb_typeof(payload -> 'witnesses') = 'array'
      AND jsonb_typeof(payload -> 'evidence') = 'array'
      AND jsonb_typeof(payload -> 'documents') = 'array'
      AND jsonb_typeof(payload -> 'propertyItems') = 'array'
      AND jsonb_typeof(payload -> 'expertResults') = 'array'
      AND jsonb_typeof(payload -> 'allegationMatrix') = 'array'
      AND jsonb_typeof(payload -> 'narrative') = 'object'
    )
  );

CREATE INDEX IF NOT EXISTS "FinalReport_payload_gin_idx"
  ON "FinalReport" USING GIN (payload jsonb_path_ops);
CREATE INDEX IF NOT EXISTS "FinalReport_template_profile_idx"
  ON "FinalReport" ((payload #>> '{reportMetadata,templateProfile}'));
CREATE INDEX IF NOT EXISTS "FinalReport_legal_regime_idx"
  ON "FinalReport" ((payload #>> '{reportMetadata,legalRegime}'));
CREATE INDEX IF NOT EXISTS "FinalReport_number_idx"
  ON "FinalReport" ((payload #>> '{reportMetadata,finalReportNumber}'));
CREATE INDEX IF NOT EXISTS "FinalReportVersion_snapshot_gin_idx"
  ON "FinalReportVersion" USING GIN (snapshot jsonb_path_ops);
