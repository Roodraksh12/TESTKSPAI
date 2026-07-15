import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  buildCaseIntakeBrief,
  packSummaryWithMo,
  persistIntakeMatches,
} from "@/lib/scrb/intake-intel";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();

    const count = await prisma.case.count({ where: { stationId: session.user.stationId } });
    const year = new Date().getFullYear();
    const firNumber = `FIR/${year}/${String(count + 1).padStart(4, "0")}`;

    let incidentDate = new Date();
    try {
      if (data.incidentDate && data.incidentDate !== "Unknown") {
        incidentDate = new Date(data.incidentDate);
      }
    } catch {
      /* keep now */
    }

    const narrative = data.narrativeSummary || data.summary || "";
    const modusOperandi = data.modusOperandi || null;
    const summary = packSummaryWithMo(narrative, modusOperandi);

    const newCase = await prisma.case.create({
      data: {
        firNumber,
        stationId: session.user.stationId,
        crimeType: data.crimeType || "Unknown",
        status: "OPEN",
        incidentDate,
        summary,
        rawExtractedText: data.rawText,
        createdFromScan: true,
      },
    });

    const accusedPersonIds: string[] = [];
    for (const name of data.accusedNames || []) {
      if (!name?.trim()) continue;

      let person = await prisma.person.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });

      if (!person) {
        person = await prisma.person.create({
          data: { name, role: "ACCUSED" },
        });
      }

      await prisma.casePerson.create({
        data: { caseId: newCase.id, personId: person.id, role: "ACCUSED" },
      });

      accusedPersonIds.push(person.id);
    }

    for (let i = 0; i < accusedPersonIds.length; i++) {
      for (let j = i + 1; j < accusedPersonIds.length; j++) {
        const existingConn = await prisma.connection.findFirst({
          where: {
            OR: [
              { personAId: accusedPersonIds[i], personBId: accusedPersonIds[j] },
              { personAId: accusedPersonIds[j], personBId: accusedPersonIds[i] },
            ],
          },
        });

        if (!existingConn) {
          await prisma.connection.create({
            data: {
              personAId: accusedPersonIds[i],
              personBId: accusedPersonIds[j],
              relationType: "CO_ACCUSED",
              sourceCaseId: newCase.id,
            },
          });
        }
      }
    }

    if (data.victimName && data.victimName !== "null") {
      let person = await prisma.person.findFirst({
        where: { name: { equals: data.victimName, mode: "insensitive" } },
      });

      if (!person) {
        person = await prisma.person.create({
          data: { name: data.victimName, role: "VICTIM" },
        });
      }

      await prisma.casePerson.create({
        data: { caseId: newCase.id, personId: person.id, role: "VICTIM" },
      });
    }

    // Server-side identity + MO matching (real DB) — authoritative
    await persistIntakeMatches({
      caseId: newCase.id,
      stationId: session.user.stationId,
      accusedNames: data.accusedNames || [],
      victimName: data.victimName,
      crimeType: data.crimeType || "Unknown",
      summary,
      modusOperandi,
    });

    await prisma.auditLog.create({
      data: {
        officerId: session.user.id,
        action: "CREATE_CASE",
        targetType: "CASE",
        targetId: newCase.id,
        details: `Created via FIR Scan: ${firNumber}`,
      },
    });

    const isSp = session.user.role === "SP";
    const intake = await buildCaseIntakeBrief(newCase.id, session.user.stationId, { isSp });

    return NextResponse.json({
      success: true,
      caseId: newCase.id,
      firNumber,
      intake: "error" in intake ? null : intake,
    });
  } catch (error) {
    console.error("Create Case Error:", error);
    return NextResponse.json({ error: "Failed to save the case." }, { status: 500 });
  }
}
