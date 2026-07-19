-- SCRB Sahayak demo seed data
-- Targets the Prisma-compatible (PascalCase) schema in 0003_prisma_compatible_schema.sql,
-- which is the schema the FastAPI backend actually queries against. 0001/0002 describe an
-- earlier Supabase-Auth-linked design that the running app does not use — apply 0003, not 0001+0002.
--
-- Produces a demo-ready dataset: cases spread across the last ~6 months, several cases
-- overdue on the 60-day charge-sheet clock, a same-week crime spike, and a criminal network
-- with two case-clusters bridged by a shared accused (for ring/broker detection).

insert into "District" (id, name) values
  ('district-belagavi', 'Belagavi'),
  ('district-bengaluru-urban', 'Bengaluru Urban'),
  ('district-dakshina-kannada', 'Dakshina Kannada'),
  ('district-hubballi-dharwad', 'Hubballi-Dharwad'),
  ('district-kalaburagi', 'Kalaburagi'),
  ('district-mysuru', 'Mysuru')
on conflict (id) do nothing;

insert into "PoliceStation" (id, name, "districtId") values
  ('station-indiranagar-ps', 'Indiranagar PS', 'district-bengaluru-urban'),
  ('station-kuvempunagar-ps', 'Kuvempunagar PS', 'district-mysuru'),
  ('station-whitefield-ps', 'Whitefield PS', 'district-bengaluru-urban')
on conflict (id) do nothing;

-- Demo officers: badge IDs KA-CON-1001 / KA-INS-4471 / KA-SP-9999, all password demo1234.
-- passwordHash below is bcrypt('demo1234'); regenerate with backend/scripts/seed_supabase.py
-- if you need a fresh hash (bcrypt salts are random on every run).
insert into "Officer" (id, "badgeId", "passwordHash", name, role, "stationId") values
  ('officer-constable-demo', 'KA-CON-1001', '$2b$10$9xGWyAisITUSGE7IG0iP0uPAPquMfRzCKcT1ZGtQ.RDK1rmmX0NF2', 'Ramesh K (Demo Constable)', 'CONSTABLE', 'station-whitefield-ps'),
  ('officer-inspector-demo', 'KA-INS-4471', '$2b$10$9xGWyAisITUSGE7IG0iP0uPAPquMfRzCKcT1ZGtQ.RDK1rmmX0NF2', 'Suresh V (Demo Inspector)', 'INSPECTOR', 'station-whitefield-ps'),
  ('officer-sp-demo', 'KA-SP-9999', '$2b$10$9xGWyAisITUSGE7IG0iP0uPAPquMfRzCKcT1ZGtQ.RDK1rmmX0NF2', 'Priya M (Demo SP)', 'SP', 'station-whitefield-ps')
on conflict ("badgeId") do update set "passwordHash" = excluded."passwordHash";

insert into "Person" (id, name, role, phone, address) values
  ('person-anita-d', 'Anita D', 'VICTIM', '9123456789', '789 1st Ave, Whitefield'),
  ('person-anitha-b', 'Anitha B', 'VICTIM', '9812345614', '27 Domlur, Indiranagar'),
  ('person-aslam-k', 'Aslam K', 'ACCUSED', '9812345620', '60 Indiranagar 1st Stage, Indiranagar'),
  ('person-chandini-m', 'Chandini M', 'WITNESS', NULL, NULL),
  ('person-deepa-n', 'Deepa N', 'VICTIM', '9812345621', '14 CMH Road, Indiranagar'),
  ('person-deepak-r', 'Deepak R', 'ACCUSED', '9000022222', '45 ITPL Road, Whitefield'),
  ('person-faisal-k', 'Faisal K', 'ACCUSED', '9812345602', '22 Hoodi Circle, Whitefield'),
  ('person-farida-s', 'Farida S', 'VICTIM', '9812345608', '31 Varthur Road, Whitefield'),
  ('person-geetha-r', 'Geetha R', 'VICTIM', '9812345604', '56 Brookefield, Whitefield'),
  ('person-iqbal-pasha', 'Iqbal Pasha', 'ACCUSED', '9812345603', '9 KR Puram Main Rd, Whitefield'),
  ('person-ismail-r', 'Ismail R', 'ACCUSED', '9812345609', '45 Domlur Layout, Indiranagar'),
  ('person-kavya-n', 'Kavya N', 'WITNESS', NULL, NULL),
  ('person-lakshmi-p', 'Lakshmi P', 'VICTIM', '9812345606', '18 ITPL Main Road, Whitefield'),
  ('person-mahesh-t', 'Mahesh T', 'ACCUSED', '9812345605', '3 CV Raman Nagar, Indiranagar'),
  ('person-manjunath-s', 'Manjunath S', 'ACCUSED', '9000011111', '12 Ring Road, Whitefield'),
  ('person-meera-j', 'Meera J', 'VICTIM', '9812345616', '12 ITPL Road, Whitefield'),
  ('person-nandini-r', 'Nandini R', 'VICTIM', '9812345619', '8 Varthur Road, Whitefield'),
  ('person-naveen-g', 'Naveen G', 'ACCUSED', '9812345607', '88 100ft Road, Indiranagar'),
  ('person-prakash-v', 'Prakash V', 'ACCUSED', '9812345618', '23 Kadugodi, Whitefield'),
  ('person-raghu-s', 'Raghu S', 'ACCUSED', '9812345615', '5 Whitefield Main Road, Whitefield'),
  ('person-ramesh-y', 'Ramesh Y', 'ACCUSED', '9812345622', '9 Vivek Nagar, Indiranagar'),
  ('person-ravi-kumar', 'Ravi Kumar', 'ACCUSED', '9876543210', '123 Main St, Whitefield'),
  ('person-roopa-d', 'Roopa D', 'VICTIM', '9812345612', '7 Hoodi Main Road, Whitefield'),
  ('person-shabbir-a', 'Shabbir A', 'ACCUSED', '9812345613', '19 HAL 2nd Stage, Indiranagar'),
  ('person-suman-k', 'Suman K', 'WITNESS', NULL, NULL),
  ('person-sunil-rao', 'Sunil Rao', 'ACCUSED', '9988776655', '456 Cross, Indiranagar'),
  ('person-suresh-b', 'Suresh B', 'ACCUSED', '9812345601', '14 Forest Road, Whitefield'),
  ('person-tabassum-b', 'Tabassum B', 'VICTIM', '9812345623', '51 Domlur, Indiranagar'),
  ('person-vinay-k', 'Vinay K', 'ACCUSED', '9812345611', '6 Old Airport Road, Indiranagar'),
  ('person-zakir-h', 'Zakir H', 'ACCUSED', '9812345617', '40 Hope Farm, Whitefield')
on conflict (id) do nothing;

insert into "Case" (
  id, "firNumber", "stationId", "crimeType", status, "incidentDate",
  "reportedDate", latitude, longitude, summary
) values
  ('case-fir-2026-extra-101', 'FIR/2026/EXTRA-101', 'station-whitefield-ps', 'Theft', 'OPEN', '2026-02-04T20:02:26', '2026-02-04T20:02:26', 12.99774838603182, 77.73274778888393, 'Theft incident. Suspect vehicle KA-05-MJ-1101 spotted near scene.'),
  ('case-fir-2026-extra-102', 'FIR/2026/EXTRA-102', 'station-indiranagar-ps', 'Theft', 'OPEN', '2026-02-05T20:02:26', '2026-02-05T20:02:26', 12.9850103943936, 77.75948884043066, 'Theft incident. Suspect vehicle KA-05-MJ-1102 spotted near scene.'),
  ('case-fir-2026-extra-103', 'FIR/2026/EXTRA-103', 'station-whitefield-ps', 'Theft', 'OPEN', '2026-02-06T20:02:26', '2026-02-06T20:02:26', 12.97682588668831, 77.75401652116457, 'Theft incident. Suspect vehicle KA-05-MJ-1103 spotted near scene.'),
  ('case-fir-2026-extra-104', 'FIR/2026/EXTRA-104', 'station-whitefield-ps', 'Theft', 'OPEN', '2026-03-04T20:02:26', '2026-03-04T20:02:26', 12.97240846234737, 77.73011437599337, 'Theft incident. Suspect vehicle KA-05-MJ-1104 spotted near scene.'),
  ('case-fir-2026-extra-105', 'FIR/2026/EXTRA-105', 'station-indiranagar-ps', 'Theft', 'OPEN', '2026-03-05T20:02:26', '2026-03-05T20:02:26', 12.98039491283827, 77.73281236163848, 'Theft incident. Suspect vehicle KA-05-MJ-1105 spotted near scene.'),
  ('case-fir-2026-extra-106', 'FIR/2026/EXTRA-106', 'station-whitefield-ps', 'Theft', 'OPEN', '2026-03-06T20:02:26', '2026-03-06T20:02:26', 12.99342630458072, 77.7409072907601, 'Theft incident. Suspect vehicle KA-05-MJ-1106 spotted near scene.'),
  ('case-fir-2026-extra-107', 'FIR/2026/EXTRA-107', 'station-indiranagar-ps', 'Theft', 'OPEN', '2026-03-07T20:02:26', '2026-03-07T20:02:26', 12.98863633521762, 77.7469683134212, 'Theft incident. Suspect vehicle KA-05-MJ-1107 spotted near scene.'),
  ('case-fir-2026-extra-108', 'FIR/2026/EXTRA-108', 'station-whitefield-ps', 'Theft', 'OPEN', '2026-04-04T20:02:26', '2026-04-04T20:02:26', 12.97774659623168, 77.73539006708917, 'Theft incident. Suspect vehicle KA-05-MJ-1108 spotted near scene.'),
  ('case-fir-2026-extra-109', 'FIR/2026/EXTRA-109', 'station-indiranagar-ps', 'Theft', 'OPEN', '2026-04-05T20:02:26', '2026-04-05T20:02:26', 12.98266524439634, 77.7366327970306, 'Theft incident. Suspect vehicle KA-05-MJ-1109 spotted near scene.'),
  ('case-fir-2026-extra-110', 'FIR/2026/EXTRA-110', 'station-whitefield-ps', 'Burglary', 'OPEN', '2026-05-04T20:02:26', '2026-05-04T20:02:26', 12.98495923817869, 77.74595645717001, 'Burglary incident. Suspect vehicle KA-05-MJ-1110 spotted near scene.'),
  ('case-fir-2026-extra-111', 'FIR/2026/EXTRA-111', 'station-indiranagar-ps', 'Burglary', 'OPEN', '2026-05-05T20:02:26', '2026-05-05T20:02:26', 12.99629555854839, 77.73193533708508, 'Burglary incident. Suspect vehicle KA-05-MJ-1111 spotted near scene.'),
  ('case-fir-2026-extra-112', 'FIR/2026/EXTRA-112', 'station-whitefield-ps', 'Burglary', 'OPEN', '2026-05-06T20:02:26', '2026-05-06T20:02:26', 12.9900584436365, 77.74985255625224, 'Burglary incident. Suspect vehicle KA-05-MJ-1112 spotted near scene.'),
  ('case-fir-2026-0003', 'FIR/2026/0003', 'station-whitefield-ps', 'Burglary', 'CHARGESHEETED', '2026-05-10T02:00:00', '2026-05-10T08:00:00', 12.965, 77.74, 'House break-in at night. Electronics stolen.'),
  ('case-fir-2026-extra-113', 'FIR/2026/EXTRA-113', 'station-whitefield-ps', 'Burglary', 'OPEN', '2026-06-04T20:02:26', '2026-06-04T20:02:26', 12.97111030594304, 77.7475647039798, 'Burglary incident. Suspect vehicle KA-05-MJ-1113 spotted near scene.'),
  ('case-fir-2026-extra-114', 'FIR/2026/EXTRA-114', 'station-indiranagar-ps', 'Burglary', 'OPEN', '2026-06-05T20:02:26', '2026-06-05T20:02:26', 12.9762612223527, 77.74109634516176, 'Burglary incident. Suspect vehicle KA-05-MJ-1114 spotted near scene.'),
  ('case-fir-2026-extra-115', 'FIR/2026/EXTRA-115', 'station-whitefield-ps', 'Burglary', 'OPEN', '2026-06-06T20:02:26', '2026-06-06T20:02:26', 12.9895753149992, 77.74200764760101, 'Burglary incident. Suspect vehicle KA-05-MJ-1115 spotted near scene.'),
  ('case-fir-2026-extra-116', 'FIR/2026/EXTRA-116', 'station-indiranagar-ps', 'Burglary', 'OPEN', '2026-06-07T20:02:26', '2026-06-07T20:02:26', 12.99796237654816, 77.7529684256075, 'Burglary incident. Suspect vehicle KA-05-MJ-1116 spotted near scene.'),
  ('case-fir-2026-extra-117', 'FIR/2026/EXTRA-117', 'station-whitefield-ps', 'Burglary', 'OPEN', '2026-06-08T20:02:26', '2026-06-08T20:02:26', 12.97932320613777, 77.74800670654304, 'Burglary incident. Suspect vehicle KA-05-MJ-1117 spotted near scene.'),
  ('case-fir-2026-0001', 'FIR/2026/0001', 'station-whitefield-ps', 'Theft', 'UNDER_INVESTIGATION', '2026-06-15T10:00:00', '2026-06-16T09:00:00', 12.986, 77.737, 'Two-wheeler theft reported from ITPL parking lot. Suspect vehicle KA-01-AB-1234 seen leaving the scene.'),
  ('case-fir-2026-0002', 'FIR/2026/0002', 'station-whitefield-ps', 'Chain Snatching', 'OPEN', '2026-06-20T18:30:00', '2026-06-20T20:00:00', 12.971, 77.75, 'Gold chain snatched by two men on a black motorcycle. Motorcycle KA-02-CD-5678 used by the suspects.'),
  ('case-fir-2026-extra-118', 'FIR/2026/EXTRA-118', 'station-whitefield-ps', 'Vehicle Theft', 'OPEN', '2026-07-04T20:02:26', '2026-07-04T20:02:26', 12.97673078871267, 77.73919653987616, 'Vehicle Theft incident. Suspect vehicle KA-05-MJ-1118 spotted near scene.'),
  ('case-fir-2026-extra-119', 'FIR/2026/EXTRA-119', 'station-indiranagar-ps', 'Vehicle Theft', 'OPEN', '2026-07-05T20:02:26', '2026-07-05T20:02:26', 12.98717877231783, 77.75789555024686, 'Vehicle Theft incident. Suspect vehicle KA-05-MJ-1119 spotted near scene.'),
  ('case-fir-2026-extra-120', 'FIR/2026/EXTRA-120', 'station-whitefield-ps', 'Vehicle Theft', 'OPEN', '2026-07-06T20:02:26', '2026-07-06T20:02:26', 12.99816264587655, 77.73182677055438, 'Vehicle Theft incident. Suspect vehicle KA-05-MJ-1120 spotted near scene.'),
  ('case-fir-2026-extra-121', 'FIR/2026/EXTRA-121', 'station-indiranagar-ps', 'Vehicle Theft', 'OPEN', '2026-07-07T20:02:26', '2026-07-07T20:02:26', 12.996754813579, 77.75754194141648, 'Vehicle Theft incident. Suspect vehicle KA-05-MJ-1121 spotted near scene.'),
  ('case-fir-2026-extra-122', 'FIR/2026/EXTRA-122', 'station-whitefield-ps', 'Vehicle Theft', 'OPEN', '2026-07-08T20:02:26', '2026-07-08T20:02:26', 12.99723366941102, 77.7553492779359, 'Vehicle Theft incident. Suspect vehicle KA-05-MJ-1122 spotted near scene.'),
  ('case-fir-2026-extra-123', 'FIR/2026/EXTRA-123', 'station-indiranagar-ps', 'Vehicle Theft', 'OPEN', '2026-07-09T20:02:26', '2026-07-09T20:02:26', 12.97460833939823, 77.73161584478048, 'Vehicle Theft incident. Suspect vehicle KA-05-MJ-1123 spotted near scene.'),
  ('case-fir-2026-spike-127', 'FIR/2026/SPIKE-127', 'station-whitefield-ps', 'Vehicle Theft', 'OPEN', '2026-07-12T20:02:26', '2026-07-12T20:02:26', 12.992, 77.743, 'Vehicle theft reported near ITPL. Vehicle KA-03-HG-2213.'),
  ('case-fir-2026-spike-126', 'FIR/2026/SPIKE-126', 'station-whitefield-ps', 'Vehicle Theft', 'OPEN', '2026-07-13T20:02:26', '2026-07-13T20:02:26', 12.99, 77.741, 'Vehicle theft reported near ITPL. Vehicle KA-03-HG-2212.'),
  ('case-fir-2026-spike-125', 'FIR/2026/SPIKE-125', 'station-whitefield-ps', 'Vehicle Theft', 'OPEN', '2026-07-14T20:02:26', '2026-07-14T20:02:26', 12.988, 77.739, 'Vehicle theft reported near ITPL. Vehicle KA-03-HG-2211.'),
  ('case-fir-2026-spike-124', 'FIR/2026/SPIKE-124', 'station-whitefield-ps', 'Vehicle Theft', 'OPEN', '2026-07-15T20:02:26', '2026-07-15T20:02:26', 12.986, 77.737, 'Vehicle theft reported near ITPL. Vehicle KA-03-HG-2210.')
on conflict (id) do nothing;

insert into "CasePerson" (id, "caseId", "personId", role) values
  ('cp-fir-2026-0001-anita-d', 'case-fir-2026-0001', 'person-anita-d', 'VICTIM'),
  ('cp-fir-2026-0001-ravi-kumar', 'case-fir-2026-0001', 'person-ravi-kumar', 'ACCUSED'),
  ('cp-fir-2026-0002-prakash-v', 'case-fir-2026-0002', 'person-prakash-v', 'ACCUSED'),
  ('cp-fir-2026-0002-suman-k', 'case-fir-2026-0002', 'person-suman-k', 'WITNESS'),
  ('cp-fir-2026-0003-sunil-rao', 'case-fir-2026-0003', 'person-sunil-rao', 'ACCUSED'),
  ('cp-fir-2026-extra-101-suresh-b', 'case-fir-2026-extra-101', 'person-suresh-b', 'ACCUSED'),
  ('cp-fir-2026-extra-101-geetha-r', 'case-fir-2026-extra-101', 'person-geetha-r', 'VICTIM'),
  ('cp-fir-2026-extra-102-mahesh-t', 'case-fir-2026-extra-102', 'person-mahesh-t', 'ACCUSED'),
  ('cp-fir-2026-extra-103-suresh-b', 'case-fir-2026-extra-103', 'person-suresh-b', 'ACCUSED'),
  ('cp-fir-2026-extra-103-faisal-k', 'case-fir-2026-extra-103', 'person-faisal-k', 'ACCUSED'),
  ('cp-fir-2026-extra-104-meera-j', 'case-fir-2026-extra-104', 'person-meera-j', 'VICTIM'),
  ('cp-fir-2026-extra-104-naveen-g', 'case-fir-2026-extra-104', 'person-naveen-g', 'ACCUSED'),
  ('cp-fir-2026-extra-105-ismail-r', 'case-fir-2026-extra-105', 'person-ismail-r', 'ACCUSED'),
  ('cp-fir-2026-extra-106-lakshmi-p', 'case-fir-2026-extra-106', 'person-lakshmi-p', 'VICTIM'),
  ('cp-fir-2026-extra-106-suresh-b', 'case-fir-2026-extra-106', 'person-suresh-b', 'ACCUSED'),
  ('cp-fir-2026-extra-107-chandini-m', 'case-fir-2026-extra-107', 'person-chandini-m', 'WITNESS'),
  ('cp-fir-2026-extra-107-ismail-r', 'case-fir-2026-extra-107', 'person-ismail-r', 'ACCUSED'),
  ('cp-fir-2026-extra-108-vinay-k', 'case-fir-2026-extra-108', 'person-vinay-k', 'ACCUSED'),
  ('cp-fir-2026-extra-109-nandini-r', 'case-fir-2026-extra-109', 'person-nandini-r', 'VICTIM'),
  ('cp-fir-2026-extra-109-vinay-k', 'case-fir-2026-extra-109', 'person-vinay-k', 'ACCUSED'),
  ('cp-fir-2026-extra-110-faisal-k', 'case-fir-2026-extra-110', 'person-faisal-k', 'ACCUSED'),
  ('cp-fir-2026-extra-110-iqbal-pasha', 'case-fir-2026-extra-110', 'person-iqbal-pasha', 'ACCUSED'),
  ('cp-fir-2026-extra-111-shabbir-a', 'case-fir-2026-extra-111', 'person-shabbir-a', 'ACCUSED'),
  ('cp-fir-2026-extra-112-farida-s', 'case-fir-2026-extra-112', 'person-farida-s', 'VICTIM'),
  ('cp-fir-2026-extra-112-iqbal-pasha', 'case-fir-2026-extra-112', 'person-iqbal-pasha', 'ACCUSED'),
  ('cp-fir-2026-extra-113-raghu-s', 'case-fir-2026-extra-113', 'person-raghu-s', 'ACCUSED'),
  ('cp-fir-2026-extra-113-anitha-b', 'case-fir-2026-extra-113', 'person-anitha-b', 'VICTIM'),
  ('cp-fir-2026-extra-114-aslam-k', 'case-fir-2026-extra-114', 'person-aslam-k', 'ACCUSED'),
  ('cp-fir-2026-extra-115-iqbal-pasha', 'case-fir-2026-extra-115', 'person-iqbal-pasha', 'ACCUSED'),
  ('cp-fir-2026-extra-115-roopa-d', 'case-fir-2026-extra-115', 'person-roopa-d', 'VICTIM'),
  ('cp-fir-2026-extra-116-deepa-n', 'case-fir-2026-extra-116', 'person-deepa-n', 'VICTIM'),
  ('cp-fir-2026-extra-116-aslam-k', 'case-fir-2026-extra-116', 'person-aslam-k', 'ACCUSED'),
  ('cp-fir-2026-extra-117-zakir-h', 'case-fir-2026-extra-117', 'person-zakir-h', 'ACCUSED'),
  ('cp-fir-2026-extra-118-prakash-v', 'case-fir-2026-extra-118', 'person-prakash-v', 'ACCUSED'),
  ('cp-fir-2026-extra-119-ramesh-y', 'case-fir-2026-extra-119', 'person-ramesh-y', 'ACCUSED'),
  ('cp-fir-2026-extra-120-ramesh-y', 'case-fir-2026-extra-120', 'person-ramesh-y', 'ACCUSED'),
  ('cp-fir-2026-extra-120-tabassum-b', 'case-fir-2026-extra-120', 'person-tabassum-b', 'VICTIM'),
  ('cp-fir-2026-extra-121-naveen-g', 'case-fir-2026-extra-121', 'person-naveen-g', 'ACCUSED'),
  ('cp-fir-2026-extra-122-mahesh-t', 'case-fir-2026-extra-122', 'person-mahesh-t', 'ACCUSED'),
  ('cp-fir-2026-extra-123-shabbir-a', 'case-fir-2026-extra-123', 'person-shabbir-a', 'ACCUSED'),
  ('cp-fir-2026-spike-124-manjunath-s', 'case-fir-2026-spike-124', 'person-manjunath-s', 'ACCUSED'),
  ('cp-fir-2026-spike-124-kavya-n', 'case-fir-2026-spike-124', 'person-kavya-n', 'WITNESS'),
  ('cp-fir-2026-spike-125-zakir-h', 'case-fir-2026-spike-125', 'person-zakir-h', 'ACCUSED'),
  ('cp-fir-2026-spike-126-raghu-s', 'case-fir-2026-spike-126', 'person-raghu-s', 'ACCUSED'),
  ('cp-fir-2026-spike-127-manjunath-s', 'case-fir-2026-spike-127', 'person-manjunath-s', 'ACCUSED')
on conflict (id) do nothing;

insert into "Connection" (id, "personAId", "personBId", "relationType", "sourceCaseId") values
  ('connection-01-ravi-kumar-sunil-rao', 'person-ravi-kumar', 'person-sunil-rao', 'CO_ACCUSED', NULL),
  ('connection-02-manjunath-s-deepak-r', 'person-manjunath-s', 'person-deepak-r', 'CO_ACCUSED', NULL),
  ('connection-03-manjunath-s-deepak-r', 'person-manjunath-s', 'person-deepak-r', 'SAME_ADDRESS', NULL),
  ('connection-04-faisal-k-suresh-b', 'person-faisal-k', 'person-suresh-b', 'CO_ACCUSED', 'case-fir-2026-extra-103'),
  ('connection-05-faisal-k-iqbal-pasha', 'person-faisal-k', 'person-iqbal-pasha', 'CO_ACCUSED', 'case-fir-2026-extra-110'),
  ('connection-06-ismail-r-vinay-k', 'person-ismail-r', 'person-vinay-k', 'SAME_ADDRESS', NULL),
  ('connection-07-aslam-k-shabbir-a', 'person-aslam-k', 'person-shabbir-a', 'PRIOR_CASE_TOGETHER', NULL)
on conflict (id) do nothing;

insert into "CaseMatch" (id, "caseId", "matchedCaseId", "matchedPersonId", "confidenceScore", status, reason) values
  ('case-match-01', 'case-fir-2026-0002', 'case-fir-2026-0001', NULL, 85.5, 'PENDING', 'Similar MO (two men on motorcycle) and close geographical proximity.'),
  ('case-match-02', 'case-fir-2026-spike-124', 'case-fir-2026-0001', NULL, 77.5, 'PENDING', 'Similar MO: two-wheeler theft, same parking-lot pattern.'),
  ('case-match-03', 'case-fir-2026-spike-124', NULL, 'person-deepak-r', 61.0, 'PENDING', 'Name + address overlap with prior accused.'),
  ('case-match-04', 'case-fir-2026-extra-108', 'case-fir-2026-extra-109', NULL, 42.0, 'REJECTED', 'Initial MO overlap (both Theft, same week) flagged by system; officer reviewed and confirmed unrelated — different accused, no shared entities.')
on conflict (id) do nothing;

insert into "Alert" (id, "stationId", type, "zoneLabel", "riskScore", reason) values
  ('alert-01', 'station-whitefield-ps', 'HOTSPOT', 'ITPL Back Gate', 92.0, '6 vehicle thefts in the last 10 days.'),
  ('alert-02', 'station-whitefield-ps', 'ANOMALY', 'Whitefield Main Road', 58.0, 'Unusual spike in evening burglary reports.'),
  ('alert-03', 'station-indiranagar-ps', 'HOTSPOT', '100 Feet Road', 81.0, 'Chain snatching cluster, 3 incidents in 5 days.')
on conflict (id) do nothing;
