import prisma from "@/lib/prisma";

export async function searchCases(args: any, stationId: string) {
  const cases = await prisma.case.findMany({
    where: {
      stationId,
      ...(args.crimeType && { crimeType: { contains: args.crimeType, mode: "insensitive" } }),
      ...(args.status && { status: args.status }),
    },
    take: 5,
    select: { id: true, firNumber: true, crimeType: true, summary: true, status: true, incidentDate: true }
  });
  return cases;
}

export async function getCaseDossier(args: { caseId: string }, stationId: string) {
  const caseData = await prisma.case.findUnique({
    where: { id: args.caseId, stationId },
    include: {
      casePersons: { include: { person: true } },
      matches: true
    }
  });
  return caseData || { error: "Case not found or access denied." };
}

export async function getPersonConnections(args: { personId: string }, stationId: string) {
  const connections = await prisma.connection.findMany({
    where: {
      OR: [
        { personAId: args.personId },
        { personBId: args.personId }
      ]
    },
    include: {
      personA: true,
      personB: true
    }
  });
  return connections;
}

export async function getSimilarCases(args: { caseId: string }, stationId: string) {
  // Simplified for demo: return cases of same crime type
  const srcCase = await prisma.case.findUnique({ where: { id: args.caseId, stationId } });
  if (!srcCase) return { error: "Case not found" };
  
  const similar = await prisma.case.findMany({
    where: {
      stationId,
      crimeType: srcCase.crimeType,
      id: { not: srcCase.id }
    },
    take: 3,
    select: { id: true, firNumber: true, summary: true }
  });
  return similar;
}

export async function getHotspotSummary(args: { timeframe?: string }, stationId: string) {
  const alerts = await prisma.alert.findMany({
    where: { stationId },
    take: 5
  });
  return alerts;
}

export async function fetchIpcSection(args: { sectionQuery: string }, stationId: string) {
  // Mock IPC / BNS lookup for the prototype
  const db: Record<string, string> = {
    "379": "IPC Section 379: Punishment for theft. Whoever commits theft shall be punished with imprisonment of either description for a term which may extend to three years, or with fine, or with both.",
    "302": "IPC Section 302: Punishment for murder. Whoever commits murder shall be punished with death, or imprisonment for life, and shall also be liable to fine.",
    "BNS 303": "BNS Section 303 (New IPC 379): Theft. Prescribes punishment for theft similar to the old IPC 379.",
  };

  const query = args.sectionQuery.toUpperCase();
  const match = Object.keys(db).find(k => query.includes(k));
  
  if (match) return { section: match, text: db[match] };
  return { error: `Could not find legal section matching query: ${args.sectionQuery}. Try specific numbers like '379' or '302'.` };
}

export async function extractEntities(args: { text: string }, stationId: string) {
  // Mock Entity Extraction
  return {
    success: true,
    entities: {
      suspects: ["Unknown individuals mentioned in text"],
      vehicles: ["Black Pulsar (hypothetical)"],
      locations: ["Extracted location from text"],
      time: "Parsed time from text"
    },
    message: "Entities successfully extracted and queued for verification."
  };
}