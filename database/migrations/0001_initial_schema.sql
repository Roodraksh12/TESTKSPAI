create extension if not exists pgcrypto;

create type role as enum ('CONSTABLE', 'INSPECTOR', 'SP');
create type case_status as enum ('OPEN', 'UNDER_INVESTIGATION', 'CHARGESHEETED', 'CLOSED');
create type person_role as enum ('ACCUSED', 'VICTIM', 'WITNESS');
create type relation_type as enum ('CO_ACCUSED', 'SAME_ADDRESS', 'SAME_PHONE', 'PRIOR_CASE_TOGETHER');
create type match_status as enum ('PENDING', 'CONFIRMED', 'REJECTED');
create type message_role as enum ('USER', 'ASSISTANT', 'SYSTEM');
create type alert_type as enum ('HOTSPOT', 'ANOMALY');
create type rating as enum ('UP', 'DOWN');

create table districts (
  id text primary key default gen_random_uuid()::text,
  name text not null
);

create table police_stations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  district_id text not null references districts(id) on delete restrict
);

create table officers (
  id text primary key default gen_random_uuid()::text,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  badge_id text not null unique,
  password_hash text,
  name text not null,
  role role not null,
  station_id text not null references police_stations(id) on delete restrict
);

create table cases (
  id text primary key default gen_random_uuid()::text,
  fir_number text not null unique,
  station_id text not null references police_stations(id) on delete restrict,
  crime_type text not null,
  status case_status not null default 'OPEN',
  incident_date timestamptz not null,
  reported_date timestamptz not null default now(),
  latitude double precision,
  longitude double precision,
  summary text,
  raw_extracted_text text,
  created_from_scan boolean not null default false
);

create table persons (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  role person_role not null,
  phone text,
  address text
);

create table case_persons (
  id text primary key default gen_random_uuid()::text,
  case_id text not null references cases(id) on delete cascade,
  person_id text not null references persons(id) on delete cascade,
  role person_role not null
);

create table connections (
  id text primary key default gen_random_uuid()::text,
  person_a_id text not null references persons(id) on delete cascade,
  person_b_id text not null references persons(id) on delete cascade,
  relation_type relation_type not null,
  source_case_id text references cases(id) on delete set null
);

create table case_matches (
  id text primary key default gen_random_uuid()::text,
  case_id text not null references cases(id) on delete cascade,
  matched_case_id text references cases(id) on delete set null,
  matched_person_id text references persons(id) on delete set null,
  confidence_score double precision not null,
  status match_status not null default 'PENDING',
  reason text
);

create table chat_sessions (
  id text primary key default gen_random_uuid()::text,
  officer_id text not null references officers(id) on delete cascade,
  active_case_id text references cases(id) on delete set null,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id text primary key default gen_random_uuid()::text,
  session_id text not null references chat_sessions(id) on delete cascade,
  role message_role not null,
  content text not null,
  source_case_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table audit_logs (
  id text primary key default gen_random_uuid()::text,
  officer_id text not null references officers(id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id text,
  details text,
  created_at timestamptz not null default now()
);

create table alerts (
  id text primary key default gen_random_uuid()::text,
  station_id text not null references police_stations(id) on delete cascade,
  type alert_type not null,
  zone_label text not null,
  risk_score double precision not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table feedback (
  id text primary key default gen_random_uuid()::text,
  message_id text not null unique references chat_messages(id) on delete cascade,
  officer_id text not null references officers(id) on delete cascade,
  rating rating not null,
  comment text,
  created_at timestamptz not null default now()
);

create index police_stations_district_id_idx on police_stations(district_id);
create index officers_station_id_idx on officers(station_id);
create index cases_station_id_idx on cases(station_id);
create index cases_incident_date_idx on cases(incident_date);
create index case_persons_case_id_idx on case_persons(case_id);
create index case_persons_person_id_idx on case_persons(person_id);
create index case_matches_case_id_idx on case_matches(case_id);
create index audit_logs_officer_id_created_at_idx on audit_logs(officer_id, created_at desc);
create index alerts_station_id_risk_score_idx on alerts(station_id, risk_score desc);

