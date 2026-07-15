import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { findIdentityMatches, findMoSimilarCases } from "@/lib/scrb/intake-intel";

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

Extract accused names, victim if any, location, incident date, crime type, narrative, and modus operandi.

Raw Notes:
"${notes}"`;

    const { object } = await generateObject({
      model: openai(process.env.OPENROUTER_MODEL || "google/gemini-1.5-pro"),
      schema: z.object({
        crimeType: z.string().describe("E.g. Theft, Robbery, Chain Snatching"),
        incidentDate: z.string().describe("ISO date string based on notes, or today if unknown"),
        location: z.string().describe("Place of occurrence"),
        accusedNames: z.array(z.string()).describe("Accused names if known, else empty"),
        victimName: z.string().nullable().describe("Victim name if known"),
        narrativeSummary: z.string().describe("Professional FIR narrative from the notes"),
        modusOperandi: z.string().describe("Concise MO / method signature"),
      }),
      prompt,
    });

    const extractedData = {
      crimeType: object.crimeType,
      incidentDate: object.incidentDate,
      location: object.location,
      accusedNames: object.accusedNames,
      victimName: object.victimName,
      narrativeSummary: object.narrativeSummary,
      modusOperandi: object.modusOperandi,
    };

    const identity = await findIdentityMatches({
      names: [
        ...object.accusedNames,
        ...(object.victimName ? [object.victimName] : []),
      ],
      stationId: session.user.stationId,
    });

    const moSimilar = await findMoSimilarCases({
      stationId: session.user.stationId,
      crimeType: object.crimeType,
      summary: object.narrativeSummary,
      modusOperandi: object.modusOperandi,
      take: 4,
    });

    const possibleMatches = [
      ...identity.map((m) => ({
        personId: m.personId,
        name: m.name,
        reason: m.reason,
        confidenceScore: m.confidenceScore,
        isMoMatch: false,
      })),
      ...moSimilar.map((m) => ({
        personId: null as string | null,
        name: m.firNumber,
        reason: `MO_SIMILAR: ${m.reason}`,
        confidenceScore: m.similarityScore,
        isMoMatch: true,
      })),
    ];

    return NextResponse.json({
      extractedData,
      rawText: notes,
      possibleMatches,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to draft FIR" }, { status: 500 });
  }
}
