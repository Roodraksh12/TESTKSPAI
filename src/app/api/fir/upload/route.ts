import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Tesseract from "tesseract.js";
import OpenAI from "openai";
import { z } from "zod";
import { findIdentityMatches, findMoSimilarCases } from "@/lib/scrb/intake-intel";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "dummy",
});

const extractedDataSchema = z.object({
  accusedNames: z.array(z.string()),
  victimName: z.string().nullable(),
  incidentDate: z.string(),
  location: z.string(),
  crimeType: z.string(),
  narrativeSummary: z.string(),
  modusOperandi: z.string().describe("A concise summary of the specific behavior, method, weapon, or unique signature of the crime"),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Run OCR
    const { data: { text: rawText } } = await Tesseract.recognize(buffer, "eng");

    if (!rawText.trim()) {
      return NextResponse.json({ error: "Couldn't read this scan clearly — try a sharper photo" }, { status: 400 });
    }

    // 2. Extract Data via OpenRouter (Gemini)
    const systemPrompt = `Extract the following fields from the OCR text of an FIR report. Return ONLY valid JSON matching this schema:
{
  "accusedNames": ["string"],
  "victimName": "string | null",
  "incidentDate": "ISO date string or 'Unknown'",
  "location": "string",
  "crimeType": "string",
  "narrativeSummary": "short summary",
  "modusOperandi": "concise description of the specific behavior or method used"
}`;

    const completion = await openai.chat.completions.create({
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `OCR Text:\n${rawText}` }
      ],
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0].message.content || "{}";
    
    // Parse and validate with Zod
    let extractedData;
    try {
      extractedData = extractedDataSchema.parse(JSON.parse(responseText));
    } catch (e) {
      // Retry once if validation fails
      const retryCompletion = await openai.chat.completions.create({
        model: "google/gemini-1.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `OCR Text:\n${rawText}` },
          { role: "assistant", content: responseText },
          { role: "user", content: "The JSON was invalid or missing fields. Return ONLY valid JSON exactly matching the schema." }
        ],
        response_format: { type: "json_object" }
      });
      extractedData = extractedDataSchema.parse(JSON.parse(retryCompletion.choices[0].message.content || "{}"));
    }

    // 3. Identity + MO leads (preview before save; full match persists on case create)
    const identity = await findIdentityMatches({
      names: [
        ...extractedData.accusedNames,
        ...(extractedData.victimName ? [extractedData.victimName] : []),
      ],
      stationId: session.user.stationId,
    });

    const moSimilar = await findMoSimilarCases({
      stationId: session.user.stationId,
      crimeType: extractedData.crimeType,
      summary: extractedData.narrativeSummary,
      modusOperandi: extractedData.modusOperandi,
      take: 4,
    });

    const possibleMatches = [
      ...identity.map((m) => ({
        personId: m.personId,
        name: m.name,
        reason: m.reason,
        confidenceScore: m.confidenceScore,
        priorFirNumbers: m.priorFirNumbers,
        isMoMatch: false,
      })),
      ...moSimilar.map((m) => ({
        personId: null as string | null,
        matchedCaseId: m.caseId,
        name: m.firNumber,
        reason: `MO_SIMILAR: ${m.reason}`,
        confidenceScore: m.similarityScore,
        isMoMatch: true,
      })),
    ];

    return NextResponse.json({
      rawText,
      extractedData,
      possibleMatches,
      identityPreview: identity,
      moSimilarPreview: moSimilar,
    });

  } catch (error) {
    console.error("OCR Upload Error:", error);
    return NextResponse.json({ error: "Failed to process the uploaded file." }, { status: 500 });
  }
}
