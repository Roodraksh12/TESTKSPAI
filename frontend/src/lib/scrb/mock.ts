export type CaseStatus = "Active" | "Under Review" | "Cold" | "Closed";

export type CaseRecord = {
  id: string;
  firNumber: string;
  title: string;
  crimeType: string;
  date: string;
  station: string;
  status: CaseStatus;
  summary: string;
  entities: string[];
  location: string;
};

export const CASES: CaseRecord[] = [
  {
    id: "c-1042",
    firNumber: "FIR-2026-1042",
    title: "Chain snatching — MG Road",
    crimeType: "Theft",
    date: "2026-06-14",
    station: "Cubbon Park",
    status: "Active",
    summary:
      "Two-wheeler-borne suspects targeted a pedestrian near Trinity Circle. Recovered CCTV footage shows a red Pulsar 150, partial plate KA-05-MJ-••••.",
    entities: ["Vehicle KA-05-MJ", "Suspect: 'Chotu'", "Location: Trinity Circle"],
    location: "Bengaluru City",
  },
  {
    id: "c-1039",
    firNumber: "FIR-2026-1039",
    title: "House break-in — Indiranagar",
    crimeType: "Burglary",
    date: "2026-06-11",
    station: "Indiranagar",
    status: "Under Review",
    summary:
      "Entry via balcony grill. Modus operandi consistent with three prior burglaries in HAL 2nd stage during Q1.",
    entities: ["MO Cluster: Grill-cut", "Suspect ring: 'Shivaji Nagar 4'"],
    location: "Bengaluru City",
  },
  {
    id: "c-1021",
    firNumber: "FIR-2026-1021",
    title: "Cheque fraud — Jayanagar branch",
    crimeType: "Economic Offence",
    date: "2026-05-30",
    station: "Jayanagar",
    status: "Active",
    summary:
      "Forged endorsements on 4 cheques totalling ₹18.6L. Two beneficiary accounts flagged by RBI CFR list.",
    entities: ["A/C: HDFC-••4491", "PAN: AXXPB••••K", "Beneficiary: R. Kumar"],
    location: "Bengaluru City",
  },
  {
    id: "c-0984",
    firNumber: "FIR-2026-0984",
    title: "Vehicle theft — Whitefield",
    crimeType: "Vehicle Theft",
    date: "2026-05-18",
    status: "Cold",
    station: "Whitefield",
    summary: "Honda Activa lifted from apartment basement. No CCTV coverage in stairwell.",
    entities: ["Vehicle KA-03-HG-2210"],
    location: "Bengaluru City",
  },
  {
    id: "c-0961",
    firNumber: "FIR-2026-0961",
    title: "Missing person — Age 17",
    crimeType: "Missing",
    date: "2026-05-04",
    station: "Yelahanka",
    status: "Under Review",
    summary: "Minor last seen at bus stop 4B. Phone tower ping at 11:42 near Devanahalli exit.",
    entities: ["Subject: R.S.", "Tower: DEV-4"],
    location: "Bengaluru Rural",
  },
];

export type Suggestion = { icon: string; text: string };

export const SUGGESTIONS: Suggestion[] = [
  { icon: "search", text: "Show all chain-snatching FIRs on MG Road in the last 90 days" },
  { icon: "network", text: "Link suspects across FIR-2026-1042 and FIR-2026-1039" },
  { icon: "map", text: "Hotspots for vehicle theft in Bengaluru East, Q2" },
  { icon: "file", text: "Summarise FIR-2026-1021 with entities and next steps" },
];

export type ChatMessage = {
  id: string;
  role: "user" | "ai";
  text: string;
  sources?: { label: string; ref: string }[];
  confidence?: number;
  reasoning?: string;
};

export const SEED_MESSAGES: ChatMessage[] = [
  {
    id: "m-0",
    role: "ai",
    text: "Namaskara, Inspector. I've reviewed 3 open cases assigned to Cubbon Park station this morning. Two share a suspect signature. Would you like me to draft a linkage brief, or start with FIR-2026-1042?",
    sources: [
      { label: "Case Ledger", ref: "cubbon-park-open" },
      { label: "MO Cluster DB", ref: "mo-cluster-2026-q2" },
    ],
    confidence: 92,
    reasoning:
      "Two active FIRs (1042, 1039) share the vehicle-signature KA-05-MJ pattern flagged in the Q2 MO cluster. Confidence blends record match (0.94) with temporal proximity (0.88).",
  },
];

export type HotspotArea = {
  id: string;
  name: string;
  risk: "High" | "Elevated" | "Moderate";
  delta: number;
  crimes: number;
  x: number;
  y: number;
};

export const HOTSPOTS: HotspotArea[] = [
  { id: "h1", name: "MG Road / Trinity", risk: "High", delta: 18, crimes: 42, x: 62, y: 44 },
  { id: "h2", name: "HAL 2nd Stage", risk: "Elevated", delta: 9, crimes: 27, x: 74, y: 38 },
  { id: "h3", name: "Jayanagar 4th Block", risk: "Elevated", delta: 6, crimes: 19, x: 44, y: 70 },
  { id: "h4", name: "Whitefield Depot", risk: "Moderate", delta: -3, crimes: 12, x: 84, y: 30 },
  { id: "h5", name: "Yelahanka New Town", risk: "Moderate", delta: 2, crimes: 9, x: 55, y: 18 },
];

export type NetworkNode = {
  id: string;
  label: string;
  kind: "Person" | "Vehicle" | "Location" | "Case";
  x: number;
  y: number;
};
export type NetworkEdge = { from: string; to: string; label: string };

export const NETWORK: { nodes: NetworkNode[]; edges: NetworkEdge[] } = {
  nodes: [
    { id: "n1", label: "FIR-2026-1042", kind: "Case", x: 30, y: 40 },
    { id: "n2", label: "FIR-2026-1039", kind: "Case", x: 70, y: 40 },
    { id: "n3", label: "KA-05-MJ-••••", kind: "Vehicle", x: 50, y: 20 },
    { id: "n4", label: "'Chotu'", kind: "Person", x: 20, y: 68 },
    { id: "n5", label: "Trinity Circle", kind: "Location", x: 42, y: 78 },
    { id: "n6", label: "HAL 2nd Stage", kind: "Location", x: 80, y: 70 },
    { id: "n7", label: "R. Kumar", kind: "Person", x: 88, y: 20 },
  ],
  edges: [
    { from: "n1", to: "n3", label: "Vehicle used" },
    { from: "n2", to: "n3", label: "Vehicle used" },
    { from: "n1", to: "n4", label: "Suspect" },
    { from: "n1", to: "n5", label: "Location" },
    { from: "n2", to: "n6", label: "Location" },
    { from: "n2", to: "n7", label: "Suspect" },
  ],
};
