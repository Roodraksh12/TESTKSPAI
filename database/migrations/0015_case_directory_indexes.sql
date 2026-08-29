-- Bounded, jurisdiction-scoped case-directory access for the isolated test DB.
-- These indexes support the Phase 2 keyset cursor and common directory filters.
-- Production index choices must still be confirmed with representative query
-- plans before applying them to a multi-million-row operational database.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Case_station_reported_id_idx"
  ON "Case" ("stationId", "reportedDate" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "Case_station_status_reported_idx"
  ON "Case" ("stationId", status, "reportedDate" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "Case_station_crime_reported_idx"
  ON "Case" ("stationId", "crimeType", "reportedDate" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "Case_firNumber_trgm_idx"
  ON "Case" USING gin ("firNumber" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Case_summary_trgm_idx"
  ON "Case" USING gin ((COALESCE(summary, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Person_name_trgm_idx"
  ON "Person" USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Person_phone_trgm_idx"
  ON "Person" USING gin ((COALESCE(phone, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "CasePerson_case_person_idx"
  ON "CasePerson" ("caseId", "personId");

CREATE INDEX IF NOT EXISTS "PoliceStation_district_normalized_name_idx"
  ON "PoliceStation" ("districtId", LOWER(BTRIM(name)));
