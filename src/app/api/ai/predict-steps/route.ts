import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const openai = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "dummy",
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { caseId } = await req.json();

    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        casePersons: { include: { person: true } },
      }
    });

    if (!caseData) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const prompt = `You are a senior investigating officer analyzing a case dossier.
Case: ${caseData.firNumber} (${caseData.crimeType})
Summary: ${caseData.summary}
Persons involved: ${caseData.casePersons.map(cp => cp.person.name + ' (' + cp.role + ')').join(', ')}

Predict the top 3 most actionable, specific next steps for the investigating officer. Do not give generic advice. Give highly tactical steps based on the entities and crime type.`;

    const { object } = await generateObject({
      model: openai(process.env.OPENROUTER_MODEL || "google/gemini-1.5-pro"),
      schema: z.object({
        steps: z.array(
          z.object({
            id: z.string().describe("A unique 4 letter ID"),
            text: z.string().describe("Short, punchy action step (e.g. 'Subpoena Bank Records')"),
            rationale: z.string().describe("1 sentence explaining why this is the highest priority"),
          })
        ).max(3),
      }),
      prompt,
    });

    return NextResponse.json({ steps: object.steps });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to predict steps" }, { status: 500 });
  }
}
