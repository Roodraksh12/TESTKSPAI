import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const caseData = await prisma.case.findUnique({
      where: { id: params.id },
      include: {
        casePersons: { include: { person: true } }
      }
    });

    if (!caseData || (session.user.role !== 'SP' && caseData.stationId !== session.user.stationId)) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const accusedList = caseData.casePersons.filter(cp => cp.role === "ACCUSED").map(cp => cp.person.name).join(", ");
    const victimList = caseData.casePersons.filter(cp => cp.role === "VICTIM").map(cp => cp.person.name).join(", ");

    const systemPrompt = `You are a highly experienced Indian Police Service (IPS) officer and legal expert.
Your task is to draft a highly formal, legally sound "Final Report / Chargesheet under Section 173 CrPC".
You will be provided with the facts of the case.
You must return the document formatted beautifully in Markdown.

Include the following sections:
1. FORMAL HEADING (e.g. FINAL REPORT UNDER SECTION 173 CrPC)
2. CASE DETAILS (FIR Number, Date, Station)
3. DETAILS OF ACCUSED (Name, Status)
4. BRIEF FACTS OF THE CASE (Based on the summary)
5. EVIDENCE & WITNESSES (Invent some plausible police procedures taken, e.g., "Site map drawn, statements recorded under Section 161 CrPC")
6. CHARGES (Suggest relevant IPC/BNS sections based on the crime type)
7. CONCLUSION & PRAYER (Requesting the court to take cognizance)

Highlight any MISSING critical information (like "Arrest Memo not attached", "Forensic Report pending") in bold or as a note.

DO NOT output anything other than the markdown document.`;

    const userPrompt = `
FIR NUMBER: ${caseData.firNumber}
CRIME TYPE: ${caseData.crimeType}
INCIDENT DATE: ${caseData.incidentDate.toISOString()}
ACCUSED: ${accusedList || "None listed"}
VICTIM: ${victimList || "None listed"}
SUMMARY: ${caseData.summary || "No summary available"}
RAW TEXT: ${caseData.rawExtractedText || "N/A"}
`;

    const completion = await openai.chat.completions.create({
      model: "google/gemini-1.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
    });

    const chargesheetMarkdown = completion.choices[0]?.message?.content || "Failed to generate chargesheet.";

    return NextResponse.json({ success: true, chargesheet: chargesheetMarkdown });

  } catch (error) {
    console.error("Chargesheet Generation Error:", error);
    return NextResponse.json({ error: "Failed to generate chargesheet." }, { status: 500 });
  }
}
