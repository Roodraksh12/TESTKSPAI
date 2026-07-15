import prisma from "@/lib/prisma";

/** Tokenize free text for lightweight MO / name similarity (no external embeddings). */
export function tokenize(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "were", "was", "are",
  "been", "have", "has", "had", "not", "but", "they", "them", "their", "into",
  "near", "after", "before", "about", "over", "under", "while", "when", "who",
  "whom", "which", "said", "also", "than", "then", "onto", "upon", "case",
  "accused", "victim", "police", "station", "report", "fir",
]);

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach(t => { if (b.has(t)) inter++; });
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function nameSimilarity(a: string, b: string): number {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(/\s+/).filter(Boolean));
  const tb = new Set(nb.split(/\s+/).filter(Boolean));
  return jaccard(ta, tb);
}

// ── Legal framing (rule-based, auditable) ──────────────────────────────────

type LegalSuggestion = {
  sections: string[];
  evidenceNeeded: string[];
  notes: string;
};

const LEGAL_BY_CRIME: Record<string, LegalSuggestion> = {
  theft: {
    sections: ["IPC 379 / BNS 303 (Theft)", "IPC 411 / BNS 317 (Dishonestly receiving stolen property — if recovery)"],
    evidenceNeeded: ["Ownership proof of property", "Scene mahazar / seizure memo if recovered", "CCTV or eyewitness 161 statement"],
    notes: "If force or fear was used, reclassify toward robbery.",
  },
  "vehicle theft": {
    sections: ["IPC 379 / BNS 303 (Theft)", "IPC 411 (if vehicle recovered from third party)"],
    evidenceNeeded: ["RC book / ownership docs", "Parking entry logs", "CCTV of exit path", "Lookout circular if interstate"],
    notes: "Check RTO stolen vehicle module and nearby scrap yards.",
  },
  "chain snatching": {
    sections: ["IPC 392 / BNS 309 (Robbery — if force/snatch with fear)", "IPC 379 / BNS 303 (if pure theft without force)"],
    evidenceNeeded: ["Victim 161 statement", "Injury note if any", "CCTV corridor", "Description of two-wheeler / plate"],
    notes: "Most snatchings on bike are framed as robbery when force/sudden snatch is clear.",
  },
  robbery: {
    sections: ["IPC 392 / BNS 309 (Robbery)", "IPC 397 if deadly weapon"],
    evidenceNeeded: ["Weapon description", "Medical if injury", "Scene sketch", "CDR of accused if known"],
    notes: "Document use of force carefully for section selection.",
  },
  burglary: {
    sections: ["IPC 454 / 380 house-breaking / theft in dwelling", "BNS equivalents for house-breaking"],
    evidenceNeeded: ["Point of entry photos", "Tool marks", "Inventory of missing items", "Neighbour canvass"],
    notes: "Link to prior grill-cut / balcony MO clusters if present.",
  },
  assault: {
    sections: ["IPC 323 / 324 / 325 depending on injury", "IPC 506 if criminal intimidation"],
    evidenceNeeded: ["Medical certificate", "Weapon if any", "Independent witnesses"],
    notes: "Injury gravity drives the section — attach ML certificate early.",
  },
  fraud: {
    sections: ["IPC 420 / BNS 318 (Cheating)", "IT Act sections if cyber element"],
    evidenceNeeded: ["Bank statements", "Account KYC trail", "Screenshots / emails", "CDR if phone fraud"],
    notes: "Freeze beneficiary accounts via bank liaison ASAP.",
  },
  "economic offence": {
    sections: ["IPC 420 / 406 / 409 as applicable", "Prevention of Corruption Act if public servant"],
    evidenceNeeded: ["Documentary chain", "Forensic audit trail", "Beneficiary mapping"],
    notes: "Preserve original instruments; avoid overwriting digital evidence.",
  },
  missing: {
    sections: ["Missing person procedure (not always IPC initially)", "IPC 363 if kidnapping suspected"],
    evidenceNeeded: ["Last-seen statement", "Phone tower / CDR", "CCTV at exit points", "Photograph circulation"],
    notes: "Golden hour: towers, buses, hospitals, shelter homes.",
  },
};

export function suggestLegalSections(crimeType: string, summary?: string | null): LegalSuggestion {
  const key = (crimeType || "").toLowerCase();
  for (const [k, v] of Object.entries(LEGAL_BY_CRIME)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  const blob = `${crimeType} ${summary || ""}`.toLowerCase();
  if (blob.includes("snatch") || blob.includes("chain")) return LEGAL_BY_CRIME["chain snatching"];
  if (blob.includes("vehicle") || blob.includes("bike") || blob.includes("activa") || blob.includes("car")) {
    return LEGAL_BY_CRIME["vehicle theft"];
  }
  if (blob.includes("house") || blob.includes("burgl") || blob.includes("break")) return LEGAL_BY_CRIME.burglary;
  if (blob.includes("rob")) return LEGAL_BY_CRIME.robbery;
  if (blob.includes("cheat") || blob.includes("fraud") || blob.includes("cheque")) return LEGAL_BY_CRIME.fraud;
  return {
    sections: ["Review facts with court section clerk — generic IPC not auto-assigned"],
    evidenceNeeded: ["Secure scene", "Record 161 statements", "Preserve CCTV within retention window"],
    notes: "Crime type did not match a known template; officer must select sections.",
  };
}

// ── Next-step checklists ───────────────────────────────────────────────────

export type ChecklistItem = {
  id: string;
  priority: number;
  window: "0-6h" | "6-24h" | "24-72h";
  action: string;
  rationale: string;
};

const CHECKLIST_BY_CRIME: Record<string, ChecklistItem[]> = {
  theft: [
    { id: "TH01", priority: 1, window: "0-6h", action: "Secure and export nearby CCTV (incident ±2h)", rationale: "Footage often overwrites within 24–72h." },
    { id: "TH02", priority: 2, window: "0-6h", action: "Record victim/complainant 161 with property identifiers", rationale: "Serial numbers / unique marks enable recovery matching." },
    { id: "TH03", priority: 3, window: "6-24h", action: "Canvass beat informants and known receivers of stolen goods", rationale: "Quick recovery windows close fast for portable property." },
    { id: "TH04", priority: 4, window: "24-72h", action: "Check prior thefts with same MO in station + neighbouring PS", rationale: "Serial offenders reuse method and routes." },
  ],
  "vehicle theft": [
    { id: "VT01", priority: 1, window: "0-6h", action: "Pull parking / gate logs and exit CCTV", rationale: "Exit path is highest-yield evidence for vehicle theft." },
    { id: "VT02", priority: 2, window: "0-6h", action: "Issue lookout with vehicle make, colour, plate (full/partial)", rationale: "Inter-jurisdiction recovery depends on early circulation." },
    { id: "VT03", priority: 3, window: "6-24h", action: "Check scrap yards / known chop-shop locations in zone", rationale: "Vehicles are often stripped within 48h." },
    { id: "VT04", priority: 4, window: "24-72h", action: "RTO stolen vehicle flag + insurance intimation trail", rationale: "Creates official paper trail and recovery network." },
  ],
  "chain snatching": [
    { id: "CS01", priority: 1, window: "0-6h", action: "Map approach/escape roads and pull corridor CCTV", rationale: "Two-wheeler snatch uses fixed escape arterials." },
    { id: "CS02", priority: 2, window: "0-6h", action: "Record detailed suspect + vehicle descriptors from victim", rationale: "Partial plate + bike colour drives MO cluster match." },
    { id: "CS03", priority: 3, window: "6-24h", action: "Cross-check recent snatchings within 5 km / 30 days", rationale: "Often same pair of riders, different victims." },
    { id: "CS04", priority: 4, window: "24-72h", action: "Night patrol briefing on identified corridor", rationale: "Deterrence + chance interception while pattern is hot." },
  ],
  burglary: [
    { id: "BG01", priority: 1, window: "0-6h", action: "Photograph point of entry and tool marks before cleanup", rationale: "MO signature lives in entry method." },
    { id: "BG02", priority: 2, window: "0-6h", action: "Neighbour canvass for unusual visitors / vehicles", rationale: "Pre-surveillance often noted by neighbours." },
    { id: "BG03", priority: 3, window: "6-24h", action: "Fingerprint / forensic if viable surfaces", rationale: "Indoor scenes can still yield lifts." },
    { id: "BG04", priority: 4, window: "24-72h", action: "Match inventory to pawn / second-hand markets", rationale: "Jewellery and electronics surface locally." },
  ],
  default: [
    { id: "GN01", priority: 1, window: "0-6h", action: "Preserve perishable evidence (CCTV, CDR window, injuries)", rationale: "Time-sensitive sources expire first." },
    { id: "GN02", priority: 2, window: "0-6h", action: "Complete 161 of primary witnesses while memory is fresh", rationale: "Early statements reduce contamination." },
    { id: "GN03", priority: 3, window: "6-24h", action: "Verify identity matches and prior cases suggested by system", rationale: "Human confirmation required before treating as linked." },
    { id: "GN04", priority: 4, window: "24-72h", action: "Draft progress note for SHO with open tasks", rationale: "Keeps supervision and handover clean." },
  ],
};

export function getInvestigationChecklist(crimeType: string, locationHint?: string | null): ChecklistItem[] {
  const key = (crimeType || "").toLowerCase();
  let items: ChecklistItem[] | undefined;
  for (const [k, v] of Object.entries(CHECKLIST_BY_CRIME)) {
    if (k === "default") continue;
    if (key.includes(k) || k.includes(key)) {
      items = v;
      break;
    }
  }
  if (!items) {
    if (key.includes("snatch") || key.includes("chain")) items = CHECKLIST_BY_CRIME["chain snatching"];
    else if (key.includes("vehicle") || key.includes("bike") || key.includes("car")) items = CHECKLIST_BY_CRIME["vehicle theft"];
    else if (key.includes("burgl") || key.includes("house")) items = CHECKLIST_BY_CRIME.burglary;
    else if (key.includes("theft")) items = CHECKLIST_BY_CRIME.theft;
    else items = CHECKLIST_BY_CRIME.default;
  }

  if (locationHint && locationHint.trim()) {
    return [
      {
        id: "LOC1",
        priority: 0,
        window: "0-6h",
        action: `Lock scene geometry around: ${locationHint.trim()}`,
        rationale: "Location from FIR drives CCTV and beat tasking.",
      },
      ...items.map((i) => ({ ...i, priority: i.priority + 1 })),
    ];
  }
  return items;
}

// ── Identity matching ──────────────────────────────────────────────────────

export type IdentityMatch = {
  personId: string;
  name: string;
  role: string;
  phone?: string | null;
  address?: string | null;
  confidenceScore: number;
  reason: string;
  priorCaseIds: string[];
  priorFirNumbers: string[];
};

export async function findIdentityMatches(opts: {
  names: string[];
  phones?: string[];
  addresses?: string[];
  excludeCaseId?: string;
  stationId?: string;
}): Promise<IdentityMatch[]> {
  const persons = await prisma.person.findMany({
    include: {
      casePersons: {
        include: {
          case: { select: { id: true, firNumber: true, stationId: true, status: true } },
        },
      },
    },
  });

  const results: IdentityMatch[] = [];
  const phones = (opts.phones || []).map((p) => p.replace(/\D/g, "")).filter(Boolean);
  const addresses = (opts.addresses || []).map((a) => a.toLowerCase().trim()).filter(Boolean);

  for (const person of persons) {
    let bestScore = 0;
    let reasons: string[] = [];

    for (const name of opts.names) {
      const sim = nameSimilarity(name, person.name);
      if (sim >= 0.55) {
        bestScore = Math.max(bestScore, Math.round(sim * 100));
        reasons.push(`Name similarity ${Math.round(sim * 100)}% (“${name}” ↔ “${person.name}”)`);
      }
    }

    if (person.phone) {
      const pDigits = person.phone.replace(/\D/g, "");
      for (const ph of phones) {
        if (ph && pDigits && (ph === pDigits || ph.endsWith(pDigits.slice(-8)) || pDigits.endsWith(ph.slice(-8)))) {
          bestScore = Math.max(bestScore, 95);
          reasons.push(`Same phone pattern: ${person.phone}`);
        }
      }
    }

    if (person.address) {
      const pa = person.address.toLowerCase();
      for (const addr of addresses) {
        const tokensA = tokenize(addr);
        const tokensB = tokenize(pa);
        const sim = jaccard(tokensA, tokensB);
        if (sim >= 0.4) {
          bestScore = Math.max(bestScore, Math.round(70 + sim * 25));
          reasons.push(`Address overlap with “${person.address}”`);
        }
      }
    }

    if (bestScore < 55 || reasons.length === 0) continue;

    const priorCases = person.casePersons
      .map((cp) => cp.case)
      .filter((c) => c.id !== opts.excludeCaseId);

    // Prefer same-station priors in ranking but still surface others
    if (opts.stationId) {
      priorCases.sort((a, b) => {
        const as = a.stationId === opts.stationId ? 0 : 1;
        const bs = b.stationId === opts.stationId ? 0 : 1;
        return as - bs;
      });
    }

    results.push({
      personId: person.id,
      name: person.name,
      role: person.role,
      phone: person.phone,
      address: person.address,
      confidenceScore: Math.min(99, bestScore),
      reason: reasons.join("; "),
      priorCaseIds: priorCases.map((c) => c.id),
      priorFirNumbers: priorCases.map((c) => c.firNumber),
    });
  }

  results.sort((a, b) => b.confidenceScore - a.confidenceScore);
  return results.slice(0, 8);
}

// ── MO / similar cases ─────────────────────────────────────────────────────

export type MoSimilarCase = {
  caseId: string;
  firNumber: string;
  crimeType: string;
  status: string;
  summary: string | null;
  incidentDate: Date;
  similarityScore: number;
  reason: string;
};

export async function findMoSimilarCases(opts: {
  caseId?: string;
  stationId: string;
  crimeType?: string;
  summary?: string | null;
  modusOperandi?: string | null;
  take?: number;
}): Promise<MoSimilarCase[]> {
  let crimeType = opts.crimeType;
  let summary = opts.summary;
  let mo = opts.modusOperandi;
  let excludeId = opts.caseId;

  if (opts.caseId) {
    const full = await prisma.case.findUnique({ where: { id: opts.caseId } });
    if (!full) return [];
    crimeType = crimeType || full.crimeType;
    summary = summary || full.summary;
    mo = mo || extractMoFromText(full.summary) || extractMoFromText(full.rawExtractedText);
    excludeId = full.id;
  }

  const probeText = [mo, summary, crimeType].filter(Boolean).join(" ");
  const probeTokens = tokenize(probeText);

  const candidates = await prisma.case.findMany({
    where: {
      stationId: opts.stationId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      firNumber: true,
      crimeType: true,
      status: true,
      summary: true,
      rawExtractedText: true,
      incidentDate: true,
    },
    take: 50,
    orderBy: { reportedDate: "desc" },
  });

  const scored: MoSimilarCase[] = [];
  for (const c of candidates) {
    const candMo = extractMoFromText(c.summary) || extractMoFromText(c.rawExtractedText) || "";
    const candText = [candMo, c.summary, c.crimeType].filter(Boolean).join(" ");
    const sim = jaccard(probeTokens, tokenize(candText));
    const sameCrime =
      crimeType && c.crimeType.toLowerCase() === crimeType.toLowerCase() ? 0.15 : 0;
    const score = Math.min(0.99, sim + sameCrime);

    if (score < 0.18 && !sameCrime) continue;
    if (score < 0.12) continue;

    const reasons: string[] = [];
    if (sameCrime) reasons.push(`Same crime type: ${c.crimeType}`);
    if (sim >= 0.18) reasons.push(`Narrative/MO token overlap ${Math.round(sim * 100)}%`);
    if (candMo) reasons.push("Prior case has MO signature in record");

    scored.push({
      caseId: c.id,
      firNumber: c.firNumber,
      crimeType: c.crimeType,
      status: c.status,
      summary: c.summary,
      incidentDate: c.incidentDate,
      similarityScore: Math.round(score * 100),
      reason: reasons.join("; ") || "Partial similarity",
    });
  }

  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  return scored.slice(0, opts.take ?? 5);
}

export function extractMoFromText(text?: string | null): string | null {
  if (!text) return null;
  const moTag = text.match(/\[MO\]\s*([^\n]+)/i) || text.match(/\[MODUS OPERANDI\]\s*([^\n]+)/i);
  if (moTag?.[1]) return moTag[1].trim();
  return null;
}

export function packSummaryWithMo(narrative: string, mo?: string | null): string {
  const base = (narrative || "").trim();
  if (!mo?.trim()) return base;
  if (base.includes("[MO]")) return base;
  return `${base}\n\n[MO] ${mo.trim()}`;
}

// ── Persist matches for a case ─────────────────────────────────────────────

export async function persistIntakeMatches(opts: {
  caseId: string;
  stationId: string;
  accusedNames: string[];
  victimName?: string | null;
  phones?: string[];
  addresses?: string[];
  crimeType: string;
  summary?: string | null;
  modusOperandi?: string | null;
}) {
  const names = [
    ...opts.accusedNames,
    ...(opts.victimName && opts.victimName !== "null" ? [opts.victimName] : []),
  ].filter(Boolean);

  const identity = await findIdentityMatches({
    names,
    phones: opts.phones,
    addresses: opts.addresses,
    excludeCaseId: opts.caseId,
    stationId: opts.stationId,
  });

  const moSimilar = await findMoSimilarCases({
    caseId: opts.caseId,
    stationId: opts.stationId,
    crimeType: opts.crimeType,
    summary: opts.summary,
    modusOperandi: opts.modusOperandi,
    take: 5,
  });

  // Clear only auto-pending we might re-create? Safer: add new pending if not duplicate
  for (const m of identity) {
    const exists = await prisma.caseMatch.findFirst({
      where: {
        caseId: opts.caseId,
        matchedPersonId: m.personId,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });
    if (exists) continue;
    await prisma.caseMatch.create({
      data: {
        caseId: opts.caseId,
        matchedPersonId: m.personId,
        matchedCaseId: m.priorCaseIds[0] || null,
        confidenceScore: m.confidenceScore,
        status: "PENDING",
        reason: `IDENTITY: ${m.reason}${m.priorFirNumbers.length ? ` | Prior FIR: ${m.priorFirNumbers.slice(0, 3).join(", ")}` : ""}`,
      },
    });
  }

  for (const m of moSimilar) {
    const exists = await prisma.caseMatch.findFirst({
      where: {
        caseId: opts.caseId,
        matchedCaseId: m.caseId,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });
    if (exists) continue;
    await prisma.caseMatch.create({
      data: {
        caseId: opts.caseId,
        matchedCaseId: m.caseId,
        confidenceScore: m.similarityScore,
        status: "PENDING",
        reason: `MO_SIMILAR: ${m.reason}`,
      },
    });
  }

  return { identity, moSimilar };
}

// ── Full intake brief ──────────────────────────────────────────────────────

export type IntakeBrief = {
  caseId: string;
  firNumber: string;
  crimeType: string;
  status: string;
  summary: string | null;
  persons: { name: string; role: string; phone?: string | null }[];
  identityMatches: IdentityMatch[];
  moSimilar: MoSimilarCase[];
  legal: LegalSuggestion;
  checklist: ChecklistItem[];
  hotspotContext: {
    elevated: boolean;
    relatedAlerts: { zoneLabel: string; riskScore: number; reason: string; type: string }[];
    sameCrimeRecentCount: number;
  };
  markdown: string;
  actionPrompts: string[];
};

export async function buildCaseIntakeBrief(
  caseId: string,
  stationId: string,
  opts?: { isSp?: boolean }
): Promise<IntakeBrief | { error: string }> {
  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      station: true,
      casePersons: { include: { person: true } },
      matches: {
        include: { matchedCase: true, matchedPerson: true },
        orderBy: { confidenceScore: "desc" },
      },
    },
  });

  if (!caseData) return { error: "Case not found" };
  if (!opts?.isSp && caseData.stationId !== stationId) {
    return { error: "Case not found or access denied" };
  }

  const effectiveStation = caseData.stationId;
  const accusedNames = caseData.casePersons
    .filter((cp) => cp.role === "ACCUSED")
    .map((cp) => cp.person.name);
  const victim = caseData.casePersons.find((cp) => cp.role === "VICTIM")?.person;
  const mo = extractMoFromText(caseData.summary) || extractMoFromText(caseData.rawExtractedText);

  // Refresh analysis (does not require re-upload)
  const { identity, moSimilar } = await persistIntakeMatches({
    caseId: caseData.id,
    stationId: effectiveStation,
    accusedNames,
    victimName: victim?.name,
    phones: caseData.casePersons.map((cp) => cp.person.phone).filter(Boolean) as string[],
    addresses: caseData.casePersons.map((cp) => cp.person.address).filter(Boolean) as string[],
    crimeType: caseData.crimeType,
    summary: caseData.summary,
    modusOperandi: mo,
  });

  const legal = suggestLegalSections(caseData.crimeType, caseData.summary);
  const checklist = getInvestigationChecklist(caseData.crimeType, caseData.station?.name);

  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sameCrimeRecentCount = await prisma.case.count({
    where: {
      stationId: effectiveStation,
      crimeType: { equals: caseData.crimeType, mode: "insensitive" },
      reportedDate: { gte: since },
      id: { not: caseData.id },
    },
  });

  const alerts = await prisma.alert.findMany({
    where: { stationId: effectiveStation },
    orderBy: { riskScore: "desc" },
    take: 5,
  });

  const relatedAlerts = alerts.filter((a) => {
    const blob = `${a.zoneLabel} ${a.reason}`.toLowerCase();
    const ct = caseData.crimeType.toLowerCase();
    return blob.includes(ct.split(" ")[0]) || a.riskScore >= 70;
  });

  const elevated = sameCrimeRecentCount >= 2 || relatedAlerts.some((a) => a.riskScore >= 70);

  const persons = caseData.casePersons.map((cp) => ({
    name: cp.person.name,
    role: cp.role,
    phone: cp.person.phone,
  }));

  const actionPrompts = [
    "Review identity matches and tell me which to confirm",
    "Show MO-similar cases for this FIR",
    "Give me the 24–72h investigation checklist",
    "Draft a short SP/SHO progress note for this case",
    "Which legal sections fit these facts?",
  ];

  const markdown = formatIntakeMarkdown({
    firNumber: caseData.firNumber,
    crimeType: caseData.crimeType,
    status: caseData.status,
    stationName: caseData.station?.name || "Station",
    summary: caseData.summary,
    persons,
    identity,
    moSimilar,
    legal,
    checklist,
    elevated,
    sameCrimeRecentCount,
    relatedAlerts: relatedAlerts.map((a) => ({
      zoneLabel: a.zoneLabel,
      riskScore: a.riskScore,
      reason: a.reason,
      type: a.type,
    })),
  });

  return {
    caseId: caseData.id,
    firNumber: caseData.firNumber,
    crimeType: caseData.crimeType,
    status: caseData.status,
    summary: caseData.summary,
    persons,
    identityMatches: identity,
    moSimilar,
    legal,
    checklist,
    hotspotContext: {
      elevated,
      relatedAlerts: relatedAlerts.map((a) => ({
        zoneLabel: a.zoneLabel,
        riskScore: a.riskScore,
        reason: a.reason,
        type: a.type,
      })),
      sameCrimeRecentCount,
    },
    markdown,
    actionPrompts,
  };
}

function formatIntakeMarkdown(p: {
  firNumber: string;
  crimeType: string;
  status: string;
  stationName: string;
  summary: string | null;
  persons: { name: string; role: string }[];
  identity: IdentityMatch[];
  moSimilar: MoSimilarCase[];
  legal: LegalSuggestion;
  checklist: ChecklistItem[];
  elevated: boolean;
  sameCrimeRecentCount: number;
  relatedAlerts: { zoneLabel: string; riskScore: number; reason: string }[];
}): string {
  const personLines =
    p.persons.length > 0
      ? p.persons.map((x) => `- **${x.role}:** ${x.name}`).join("\n")
      : "- No persons linked yet";

  const idLines =
    p.identity.length > 0
      ? p.identity
          .slice(0, 5)
          .map(
            (m) =>
              `- **${m.name}** (${m.confidenceScore}% — lead, needs officer confirm)\n  - ${m.reason}\n  - Prior FIR: ${m.priorFirNumbers.slice(0, 3).join(", ") || "none on file"}`
          )
          .join("\n")
      : "- No strong identity matches in database";

  const moLines =
    p.moSimilar.length > 0
      ? p.moSimilar
          .slice(0, 5)
          .map(
            (m) =>
              `- **${m.firNumber}** (${m.similarityScore}%) — ${m.crimeType}, ${m.status}\n  - ${m.reason}\n  - ${(m.summary || "").slice(0, 120)}`
          )
          .join("\n")
      : "- No strong MO-similar cases at this station";

  const legalLines = p.legal.sections.map((s) => `- ${s}`).join("\n");
  const evidenceLines = p.legal.evidenceNeeded.map((e) => `- ${e}`).join("\n");

  const next24 = p.checklist
    .filter((c) => c.window === "0-6h" || c.window === "6-24h")
    .slice(0, 5)
    .map((c, i) => `${i + 1}. **[${c.window}]** ${c.action} — _${c.rationale}_`)
    .join("\n");

  const riskLine = p.elevated
    ? `**Elevated.** ${p.sameCrimeRecentCount} other **${p.crimeType}** case(s) in last 14 days at station.` +
      (p.relatedAlerts[0]
        ? ` Related alert: ${p.relatedAlerts[0].zoneLabel} (risk ${p.relatedAlerts[0].riskScore}).`
        : "")
    : `No elevated hotspot signal for this crime type in the last 14 days (${p.sameCrimeRecentCount} peers).`;

  return `## Intake complete — ${p.firNumber}

**Station:** ${p.stationName} · **Type:** ${p.crimeType} · **Status:** ${p.status}

### Extracted facts
${p.summary || "_No summary_"}

**Persons**
${personLines}

### Identity / prior-record leads
_All matches are leads only — confirm or reject before treating as linked._
${idLines}

### MO-similar cases (this station)
${moLines}

### Suggested legal framing
${legalLines}

**Evidence still needed**
${evidenceLines}

_${p.legal.notes}_

### Next 24h actions
${next24}

### Risk / hotspot context
${riskLine}

---
I can: review matches · open similar cases · full 72h checklist · draft SP note · explain legal sections.  
**Nothing is filed until you confirm.**`;
}

// ── Draft SP / IO summary (grounded, no LLM required) ──────────────────────

export async function draftCaseSummary(
  caseId: string,
  stationId: string,
  opts?: { isSp?: boolean; audience?: "SP" | "SHO" | "IO" }
): Promise<{ draft: string } | { error: string }> {
  const caseData = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      station: true,
      casePersons: { include: { person: true } },
      matches: {
        where: { status: { in: ["PENDING", "CONFIRMED"] } },
        include: { matchedCase: true, matchedPerson: true },
      },
    },
  });

  if (!caseData) return { error: "Case not found" };
  if (!opts?.isSp && caseData.stationId !== stationId) {
    return { error: "Access denied" };
  }

  const audience = opts?.audience || "SP";
  const people = caseData.casePersons
    .map((cp) => `${cp.person.name} (${cp.role})`)
    .join("; ");
  const pendingMatches = caseData.matches.filter((m) => m.status === "PENDING");
  const confirmedMatches = caseData.matches.filter((m) => m.status === "CONFIRMED");
  const checklist = getInvestigationChecklist(caseData.crimeType, caseData.station?.name);
  const topSteps = checklist.slice(0, 3).map((c) => c.action);

  const draft = [
    `PROGRESS NOTE — for ${audience}`,
    `FIR: ${caseData.firNumber}`,
    `PS: ${caseData.station?.name || "—"}`,
    `Crime: ${caseData.crimeType} | Status: ${caseData.status}`,
    `Incident date: ${new Date(caseData.incidentDate).toLocaleString()}`,
    ``,
    `1. Facts (from case record only)`,
    caseData.summary || "No summary on record.",
    ``,
    `2. Persons on record`,
    people || "None linked.",
    ``,
    `3. Linkage status`,
    confirmedMatches.length
      ? `Confirmed links: ${confirmedMatches.map((m) => m.matchedPerson?.name || m.matchedCase?.firNumber || m.reason).join("; ")}`
      : "No confirmed cross-case links yet.",
    pendingMatches.length
      ? `Pending system leads (${pendingMatches.length}): officer verification required — not asserted as fact.`
      : "No pending system leads.",
    ``,
    `4. Proposed next actions`,
    ...topSteps.map((s, i) => `   ${i + 1}. ${s}`),
    ``,
    `5. Request / remarks`,
    audience === "SP"
      ? "Submitted for information / guidance. No arrest recommendation from system."
      : "For investigation diary. System outputs are assists only.",
    ``,
    `— Draft generated by SCRB Sahayak (officer must edit before filing) —`,
  ].join("\n");

  return { draft };
}

export async function updateMatchStatus(
  matchId: string,
  status: "CONFIRMED" | "REJECTED",
  officerId: string,
  stationId: string,
  isSp?: boolean
) {
  const match = await prisma.caseMatch.findUnique({
    where: { id: matchId },
    include: { case: true },
  });
  if (!match) return { error: "Match not found" };
  if (!isSp && match.case.stationId !== stationId) return { error: "Access denied" };

  const updated = await prisma.caseMatch.update({
    where: { id: matchId },
    data: { status },
  });

  await prisma.auditLog.create({
    data: {
      officerId,
      action: status === "CONFIRMED" ? "CONFIRM_MATCH" : "REJECT_MATCH",
      targetType: "CASE_MATCH",
      targetId: matchId,
      details: `Case ${match.caseId} match set to ${status}`,
    },
  });

  // If confirmed person match, optionally create PRIOR_CASE_TOGETHER style connection is hard without two persons
  return { success: true, match: updated };
}
