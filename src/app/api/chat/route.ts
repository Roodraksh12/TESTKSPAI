import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { createOpenAI } from "@ai-sdk/openai"
import { streamText, tool } from "ai"
import { z } from "zod"
import * as tools from "@/lib/ai-tools"
import prisma from "@/lib/prisma"

const openai = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "dummy",
})

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 })
    }

    const { messages, stationId, pageContext } = await req.json()
    // Enforce stationId from session unless SP
    const effectiveStationId = session.user.role === 'SP' && stationId ? stationId : session.user.stationId

    const contextAddition = pageContext ? `\n\n[SYSTEM CONTEXT: The user is currently viewing the following page/data: ${pageContext}. If the user asks about "this case", "this page", or "this data", refer to this context.]` : ""

    const systemPrompt = `You are an investigation assistant for Karnataka State Police, SCRB. 
Always answer in the language the officer used (English or Kannada); if asked, translate freely. 
Never state a fact about a case or person without it coming from a tool result; if the tools return nothing relevant, say so plainly instead of guessing. 
When discussing behavioral or socio-demographic patterns, ground them only in case attributes (method, timing, location, prior record) — never in caste, religion, or community, even if asked. 
Never assert a suspect match as certain — always phrase it as a lead with a confidence level, and state that an officer must confirm it. 
Keep responses concise and operational. Use markdown formatting to make your responses easy to read.${contextAddition}`

    // Log the audit asynchronously
    const lastUserMessage = messages.filter((m: any) => m.role === "user").pop()
    if (lastUserMessage) {
      prisma.auditLog.create({
        data: {
          officerId: session.user.id,
          action: "CHAT_QUERY",
          targetType: "CHAT",
          details: `Queried: ${lastUserMessage.content.substring(0, 50)}...`
        }
      }).catch(console.error)
    }

    const result = await streamText({
      model: openai(process.env.OPENROUTER_MODEL || "google/gemini-1.5-pro"),
      system: systemPrompt,
      messages,
      tools: {
        search_cases: tool({
          description: "Search cases by criteria.",
          parameters: z.object({
            crimeType: z.string().optional(),
            status: z.string().optional(),
          }),
          execute: async (args) => tools.searchCases(args, effectiveStationId),
        }),
        get_case_dossier: tool({
          description: "Get full details of a specific case.",
          parameters: z.object({
            caseId: z.string(),
          }),
          execute: async ({ caseId }) => tools.getCaseDossier({ caseId }, effectiveStationId),
        }),
        get_person_connections: tool({
          description: "Get network connections for a person.",
          parameters: z.object({
            personId: z.string(),
          }),
          execute: async ({ personId }) => tools.getPersonConnections({ personId }, effectiveStationId),
        }),
        get_similar_cases: tool({
          description: "Find cases similar to a given case.",
          parameters: z.object({
            caseId: z.string(),
          }),
          execute: async ({ caseId }) => tools.getSimilarCases({ caseId }, effectiveStationId),
        }),
        get_hotspot_summary: tool({
          description: "Get hotspot and anomaly alerts for the station.",
          parameters: z.object({
            timeframe: z.string().optional(),
          }),
          execute: async (args) => tools.getHotspotSummary(args, effectiveStationId),
        }),
      },
      maxSteps: 5, // Allow the model to call tools iteratively if needed
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error(error)
    return new Response("Internal Server Error", { status: 500 })
  }
}
