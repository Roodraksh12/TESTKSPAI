import prisma from "@/lib/prisma";
import {
  buildCaseIntakeBrief,
  draftCaseSummary,
  findIdentityMatches,
  findMoSimilarCases,
  getInvestigationChecklist,
  suggestLegalSections,
  updateMatchStatus,
  extractMoFromText,
} from "@/lib/scrb/intake-intel";

export async function searchCases(args: any, stationId: string) {
  const cases = await prisma.case.findMany({
    where: {
      stationId,
      ...(args.crimeType && { crimeType: { contains: args.crimeType, mode: "insensitive" } }),
      ...(args.status && { status: args.status }),
    },
    take: 5,
    select: { id: true, firNumber: true, crimeType: true, summary: true, status: true, incidentDate: true },
  });
  return cases;
}

export async function getCaseDossier(args: { caseId: string }, stationId: string, isSp = false) {
  const caseData = await prisma.case.findFirst({
    where: {
      id: args.caseId,
      ...(isSp ? {} : { stationId }),
    },
    include: {
      station: true,
      casePersons: { include: { person: true } },
      matches: {
        include: { matchedCase: true, matchedPerson: true },
        orderBy: { confidenceScore: "desc" },
      },
    },
  });
  return caseData || { error: "Case not found or access denied." };
}

export async function getPersonConnections(args: { personId: string }, _stationId: string) {
  const connections = await prisma.connection.findMany({
    where: {
      OR: [{ personAId: args.personId }, { personBId: args.personId }],
    },
    include: {
      personA: true,
      personB: true,
      sourceCase: { select: { id: true, firNumber: true } },
    },
  });
  return connections;
}

export async function getSimilarCases(args: { caseId: string }, stationId: string) {
  return findMoSimilarCases({ caseId: args.caseId, stationId, take: 5 });
}

export async function getHotspotSummary(args: { timeframe?: string }, stationId: string) {
  const alerts = await prisma.alert.findMany({
    where: { stationId },
    take: 5,
    orderBy: { riskScore: "desc" },
  });
  return alerts;
}

export async function fetchIpcSection(args: { sectionQuery: string }, _stationId: string) {
  const db: Record<string, string> = {
    "379": "IPC Section 379: Punishment for theft. Whoever commits theft shall be punished with imprisonment of either description for a term which may extend to three years, or with fine, or with both.",
    "392": "IPC Section 392: Punishment for robbery.",
    "302": "IPC Section 302: Punishment for murder. Whoever commits murder shall be punished with death, or imprisonment for life, and shall also be liable to fine.",
    "420": "IPC Section 420: Cheating and dishonestly inducing delivery of property.",
    "BNS 303": "BNS Section 303 (New IPC 379): Theft. Prescribes punishment for theft similar to the old IPC 379.",
    "BNS 309": "BNS Section 309: Robbery (corresponds broadly to IPC 392).",
  };

  const query = args.sectionQuery.toUpperCase();
  const match = Object.keys(db).find((k) => query.includes(k.toUpperCase()));

  if (match) return { section: match, text: db[match] };
  return {
    error: `Could not find legal section matching query: ${args.sectionQuery}. Try specific numbers like '379' or '392'.`,
  };
}

export async function extractEntities(args: { text: string }, _stationId: string) {
  const text = args.text || "";
  const phoneMatches = text.match(/\b[6-9]\d{9}\b/g) || [];
  const vehicleMatches = text.match(/\bKA[-\s]?\d{2}[-\s]?[A-Z]{1,2}[-\s]?\d{1,4}\b/gi) || [];

  return {
    success: true,
    entities: {
      phones: phoneMatches,
      vehicles: vehicleMatches,
      note: "Heuristic extraction only — verify against FIR text.",
    },
    message: "Entities extracted heuristically from provided text.",
  };
}

/** Full post-upload / post-open intake: identity, MO, legal, checklist, hotspot. */
export async function runCaseIntake(
  args: { caseId: string },
  stationId: string,
  isSp = false
) {
  return buildCaseIntakeBrief(args.caseId, stationId, { isSp });
}

export async function findIdentityMatchesTool(
  args: { caseId?: string; names?: string[] },
  stationId: string,
  isSp = false
) {
  if (args.caseId) {
    const c = await prisma.case.findFirst({
      where: { id: args.caseId, ...(isSp ? {} : { stationId }) },
      include: { casePersons: { include: { person: true } } },
    });
    if (!c) return { error: "Case not found or access denied" };
    const names = args.names?.length
      ? args.names
      : c.casePersons.map((cp) => cp.person.name);
    return findIdentityMatches({
      names,
      phones: c.casePersons.map((cp) => cp.person.phone).filter(Boolean) as string[],
      addresses: c.casePersons.map((cp) => cp.person.address).filter(Boolean) as string[],
      excludeCaseId: c.id,
      stationId: c.stationId,
    });
  }
  if (!args.names?.length) return { error: "Provide caseId or names[]" };
  return findIdentityMatches({ names: args.names, stationId });
}

export async function findMoSimilarCasesTool(
  args: { caseId: string },
  stationId: string,
  isSp = false
) {
  const c = await prisma.case.findFirst({
    where: { id: args.caseId, ...(isSp ? {} : { stationId }) },
  });
  if (!c) return { error: "Case not found or access denied" };
  return findMoSimilarCases({
    caseId: c.id,
    stationId: c.stationId,
    take: 5,
  });
}

export async function getInvestigationChecklistTool(
  args: { caseId?: string; crimeType?: string },
  stationId: string,
  isSp = false
) {
  if (args.caseId) {
    const c = await prisma.case.findFirst({
      where: { id: args.caseId, ...(isSp ? {} : { stationId }) },
      include: { station: true },
    });
    if (!c) return { error: "Case not found or access denied" };
    return {
      caseId: c.id,
      firNumber: c.firNumber,
      checklist: getInvestigationChecklist(c.crimeType, c.station?.name),
    };
  }
  if (!args.crimeType) return { error: "Provide caseId or crimeType" };
  return { checklist: getInvestigationChecklist(args.crimeType) };
}

export async function draftCaseSummaryTool(
  args: { caseId: string; audience?: "SP" | "SHO" | "IO" },
  stationId: string,
  isSp = false
) {
  return draftCaseSummary(args.caseId, stationId, {
    isSp,
    audience: args.audience || "SP",
  });
}

export async function suggestLegalSectionsTool(
  args: { caseId?: string; crimeType?: string },
  stationId: string,
  isSp = false
) {
  if (args.caseId) {
    const c = await prisma.case.findFirst({
      where: { id: args.caseId, ...(isSp ? {} : { stationId }) },
    });
    if (!c) return { error: "Case not found or access denied" };
    return {
      caseId: c.id,
      firNumber: c.firNumber,
      ...suggestLegalSections(c.crimeType, c.summary),
      mo: extractMoFromText(c.summary),
    };
  }
  if (!args.crimeType) return { error: "Provide caseId or crimeType" };
  return suggestLegalSections(args.crimeType);
}

export async function updateMatchStatusTool(
  args: { matchId: string; status: "CONFIRMED" | "REJECTED" },
  stationId: string,
  officerId: string,
  isSp = false
) {
  if (!["CONFIRMED", "REJECTED"].includes(args.status)) {
    return { error: "status must be CONFIRMED or REJECTED" };
  }
  return updateMatchStatus(args.matchId, args.status, officerId, stationId, isSp);
}
