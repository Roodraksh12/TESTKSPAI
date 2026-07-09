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
