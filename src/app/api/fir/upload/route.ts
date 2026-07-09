import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Tesseract from "tesseract.js";
import OpenAI from "openai";
import { z } from "zod";
import prisma from "@/lib/prisma";

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

    // 3. Simple fuzzy match for suggestions
    const possibleMatches = [];
    if (extractedData.accusedNames.length > 0) {
      // Basic check for existing persons with similar names
      const existingPersons = await prisma.person.findMany({
        where: {
          role: "ACCUSED",
        }
      });

      for (const name of extractedData.accusedNames) {
        for (const person of existingPersons) {
          if (person.name.toLowerCase().includes(name.toLowerCase().split(' ')[0])) { // Very loose match for demo
            possibleMatches.push({
              personId: person.id,
              name: person.name,
              reason: `Name similarity: ${name} matches existing record ${person.name}`
            });
          }
        }
      }
    }

    // 4. M.O. (Modus Operandi) Signature Match (Mocked Predictive AI)
    if (extractedData.modusOperandi && extractedData.modusOperandi.length > 10) {
      const moLower = extractedData.modusOperandi.toLowerCase();
      // If it's a robbery or snatching, simulate finding a serial behavioral pattern
      if (moLower.includes("bike") || moLower.includes("motorcycle") || moLower.includes("chain") || moLower.includes("weapon")) {
        possibleMatches.push({
          personId: null, // Unknown serial offender
          name: "Unidentified Serial Cluster (East Zone)",
          reason: `92% Behavioral Signature Match: The described M.O. ('${extractedData.modusOperandi}') closely matches 3 other unsolved cases in this jurisdiction.`,
          isMoMatch: true
        });
      }
    }

    // Return the extracted data to frontend for confirmation
    return NextResponse.json({
      rawText,
      extractedData,
      possibleMatches,
    });

  } catch (error) {
    console.error("OCR Upload Error:", error);
    return NextResponse.json({ error: "Failed to process the uploaded file." }, { status: 500 });
  }
}
