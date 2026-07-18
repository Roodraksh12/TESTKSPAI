insert into districts (id, name) values
  ('district-bengaluru-urban', 'Bengaluru Urban'),
  ('district-mysuru', 'Mysuru'),
  ('district-belagavi', 'Belagavi'),
  ('district-dakshina-kannada', 'Dakshina Kannada'),
  ('district-kalaburagi', 'Kalaburagi'),
  ('district-hubballi-dharwad', 'Hubballi-Dharwad')
on conflict (id) do nothing;

insert into police_stations (id, name, district_id) values
  ('station-whitefield', 'Whitefield PS', 'district-bengaluru-urban'),
  ('station-indiranagar', 'Indiranagar PS', 'district-bengaluru-urban'),
  ('station-kuvempunagar', 'Kuvempunagar PS', 'district-mysuru')
on conflict (id) do nothing;

-- Create matching Supabase Auth users with emails:
-- ka-con-1001@officers.ksp.local / demo1234
-- ka-ins-4471@officers.ksp.local / demo1234
-- ka-sp-9999@officers.ksp.local / demo1234
-- Then update auth_user_id below with the created auth.users IDs.
insert into officers (id, badge_id, name, role, station_id) values
  ('officer-constable-demo', 'KA-CON-1001', 'Ramesh K (Demo Constable)', 'CONSTABLE', 'station-whitefield'),
  ('officer-inspector-demo', 'KA-INS-4471', 'Suresh V (Demo Inspector)', 'INSPECTOR', 'station-whitefield'),
  ('officer-sp-demo', 'KA-SP-9999', 'Priya M (Demo SP)', 'SP', 'station-whitefield')
on conflict (badge_id) do nothing;

insert into persons (id, name, role, phone, address) values
  ('person-ravi-kumar', 'Ravi Kumar', 'ACCUSED', '9876543210', '123 Main St, Whitefield'),
  ('person-sunil-rao', 'Sunil Rao', 'ACCUSED', '9988776655', '456 Cross, Indiranagar'),
  ('person-anita-d', 'Anita D', 'VICTIM', '9123456789', '789 1st Ave, Whitefield')
on conflict (id) do nothing;

insert into connections (id, person_a_id, person_b_id, relation_type) values
  ('connection-ravi-sunil', 'person-ravi-kumar', 'person-sunil-rao', 'CO_ACCUSED')
on conflict (id) do nothing;

insert into cases (
  id, fir_number, station_id, crime_type, status, incident_date,
  reported_date, latitude, longitude, summary
) values
  (
    'case-fir-2026-0001', 'FIR/2026/0001', 'station-whitefield', 'Theft',
    'UNDER_INVESTIGATION', '2026-06-15T10:00:00Z', '2026-06-16T09:00:00Z',
    12.986, 77.737, 'Two-wheeler theft reported from ITPL parking lot.'
  ),
  (
    'case-fir-2026-0002', 'FIR/2026/0002', 'station-whitefield', 'Chain Snatching',
    'OPEN', '2026-06-20T18:30:00Z', '2026-06-20T20:00:00Z',
    12.971, 77.750, 'Gold chain snatched by two men on a black motorcycle.'
  ),
  (
    'case-fir-2026-0003', 'FIR/2026/0003', 'station-whitefield', 'Burglary',
    'CHARGESHEETED', '2026-05-10T02:00:00Z', '2026-05-10T08:00:00Z',
    12.965, 77.740, 'House break-in at night. Electronics stolen.'
  )
on conflict (id) do nothing;

insert into case_persons (id, case_id, person_id, role) values
  ('case-person-0001-ravi', 'case-fir-2026-0001', 'person-ravi-kumar', 'ACCUSED'),
  ('case-person-0001-anita', 'case-fir-2026-0001', 'person-anita-d', 'VICTIM'),
  ('case-person-0003-sunil', 'case-fir-2026-0003', 'person-sunil-rao', 'ACCUSED')
on conflict (id) do nothing;

insert into case_matches (
  id, case_id, matched_case_id, confidence_score, status, reason
) values
  (
    'case-match-0002-0001', 'case-fir-2026-0002', 'case-fir-2026-0001',
    85.5, 'PENDING', 'Similar MO (two men on motorcycle) and close geographical proximity.'
  )
on conflict (id) do nothing;

insert into alerts (id, station_id, type, zone_label, risk_score, reason) values
  (
    'alert-itpl-back-gate', 'station-whitefield', 'HOTSPOT', 'ITPL Back Gate',
    92.0, '3 vehicle thefts in the last 14 days.'
  )
on conflict (id) do nothing;
