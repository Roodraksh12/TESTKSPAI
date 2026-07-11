import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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

    const { notes } = await req.json();

    const prompt = `You are an expert police intake system. You are given raw field notes from a police officer.
Draft a highly structured, professional First Information Report (FIR) based on these notes.

Extract the entities (persons mentioned) and predict the most likely Crime Type (e.g., "Theft", "Assault", "Cybercrime").
Draft a professional summary.

Raw Notes:
"${notes}"`;

    const { object } = await generateObject({
      model: openai(process.env.OPENROUTER_MODEL || "google/gemini-1.5-pro"),
      schema: z.object({
        crimeType: z.string().describe("E.g. Theft, Robbery, Assault"),
        incidentDate: z.string().describe("ISO date string based on notes, or today if unknown"),
        summary: z.string().describe("Professional FIR summary translated from the raw notes"),
        entities: z.array(z.string()).describe("Names of people involved"),
      }),
      prompt,
    });

    const extractedData = {
      firNumber: "FIR-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000),
      crimeType: object.crimeType,
      incidentDate: object.incidentDate,
      summary: object.summary,
      entities: object.entities,
    };

    return NextResponse.json({
      extractedData,
      rawText: notes,
      possibleMatches: [] // Mock matches for now
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to draft FIR" }, { status: 500 });
  }
}
