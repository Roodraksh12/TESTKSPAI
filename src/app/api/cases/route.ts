import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    
    // Generate a new FIR Number (mock generation logic)
    const count = await prisma.case.count({ where: { stationId: session.user.stationId } });
    const year = new Date().getFullYear();
    const firNumber = `FIR/${year}/${String(count + 1).padStart(4, '0')}`;
    
    let incidentDate = new Date();
    try {
      if (data.incidentDate && data.incidentDate !== 'Unknown') {
        incidentDate = new Date(data.incidentDate);
      }
    } catch (e) {}

    const newCase = await prisma.case.create({
      data: {
        firNumber,
        stationId: session.user.stationId,
        crimeType: data.crimeType || "Unknown",
        status: "OPEN",
        incidentDate,
        summary: data.narrativeSummary,
        rawExtractedText: data.rawText,
        createdFromScan: true,
      }
    });

    // Process People (Accused and Victim)
    const accusedPersonIds = [];
    for (const name of data.accusedNames || []) {
      if (!name.trim()) continue;
      
      // 1. Entity Resolution: Check if person already exists
      let person = await prisma.person.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } }
      });

      if (!person) {
        person = await prisma.person.create({
          data: { name, role: "ACCUSED" }
        });
      }

      await prisma.casePerson.create({
        data: { caseId: newCase.id, personId: person.id, role: "ACCUSED" }
      });
      
      accusedPersonIds.push(person.id);
    }

    // 2. Create connections (CO_ACCUSED) between all accused in this case
    for (let i = 0; i < accusedPersonIds.length; i++) {
      for (let j = i + 1; j < accusedPersonIds.length; j++) {
        const existingConn = await prisma.connection.findFirst({
          where: {
            OR: [
              { personAId: accusedPersonIds[i], personBId: accusedPersonIds[j] },
              { personAId: accusedPersonIds[j], personBId: accusedPersonIds[i] }
            ]
          }
        });

        if (!existingConn) {
          await prisma.connection.create({
            data: {
              personAId: accusedPersonIds[i],
              personBId: accusedPersonIds[j],
              relationType: "CO_ACCUSED",
              sourceCaseId: newCase.id
            }
          });
        }
      }
    }

    if (data.victimName && data.victimName !== 'null') {
      let person = await prisma.person.findFirst({
        where: { name: { equals: data.victimName, mode: 'insensitive' } }
      });

      if (!person) {
        person = await prisma.person.create({
          data: { name: data.victimName, role: "VICTIM" }
        });
      }
      
      await prisma.casePerson.create({
        data: { caseId: newCase.id, personId: person.id, role: "VICTIM" }
      });
    }

    // Process Matches
    if (data.possibleMatches && data.possibleMatches.length > 0) {
      for (const match of data.possibleMatches) {
        await prisma.caseMatch.create({
          data: {
            caseId: newCase.id,
            matchedPersonId: match.personId || null,
            confidenceScore: match.isMoMatch ? 92 : 75,
            status: "PENDING",
            reason: match.reason
          }
        });
      }
    }

    // Log the audit
    await prisma.auditLog.create({
      data: {
        officerId: session.user.id,
        action: "CREATE_CASE",
        targetType: "CASE",
        targetId: newCase.id,
        details: `Created via FIR Scan: ${firNumber}`
      }
    });

    return NextResponse.json({ success: true, caseId: newCase.id });

  } catch (error) {
    console.error("Create Case Error:", error);
    return NextResponse.json({ error: "Failed to save the case." }, { status: 500 });
  }
}
