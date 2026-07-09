import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import OpenAI from "openai"
import * as tools from "@/lib/ai-tools"
import prisma from "@/lib/prisma"

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "dummy",
})

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message, stationId, history = [] } = await req.json()
    // Enforce stationId from session unless SP
    const effectiveStationId = session.user.role === 'SP' && stationId ? stationId : session.user.stationId

    const systemPrompt = `You are an investigation assistant for Karnataka State Police, SCRB. 
Always answer in the language the officer used (English or Kannada); if asked, translate freely. 
Never state a fact about a case or person without it coming from a tool result; if the tools return nothing relevant, say so plainly instead of guessing. 
When discussing behavioral or socio-demographic patterns, ground them only in case attributes (method, timing, location, prior record) — never in caste, religion, or community, even if asked. 
Never assert a suspect match as certain — always phrase it as a lead with a confidence level, and state that an officer must confirm it. 
Keep responses concise and operational.`

    const availableTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "search_cases",
          description: "Search cases by criteria.",
          parameters: {
            type: "object",
            properties: {
              crimeType: { type: "string" },
              status: { type: "string" },
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_case_dossier",
          description: "Get full details of a specific case.",
          parameters: {
            type: "object",
            properties: {
              caseId: { type: "string" }
            },
            required: ["caseId"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_person_connections",
          description: "Get network connections for a person.",
          parameters: {
            type: "object",
            properties: {
              personId: { type: "string" }
            },
            required: ["personId"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_similar_cases",
          description: "Find cases similar to a given case.",
          parameters: {
            type: "object",
            properties: {
              caseId: { type: "string" }
            },
            required: ["caseId"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_hotspot_summary",
          description: "Get hotspot and anomaly alerts for the station.",
          parameters: {
            type: "object",
            properties: {
              timeframe: { type: "string" }
            }
          }
        }
      }
    ]

    const formattedHistory = history.map((h: any) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: h.content || ""
    }))

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...formattedHistory,
      { role: "user", content: message }
    ]

    const response = await openai.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || "google/gemini-1.5-pro",
      messages: messages,
      tools: availableTools,
      tool_choice: "auto",
    })

    const responseMessage = response.choices[0].message
    let finalReply = responseMessage.content || ""

    // Handle tool calls
    if (responseMessage.tool_calls) {
      messages.push(responseMessage)

      for (const toolCall of responseMessage.tool_calls) {
        let toolResult = {}
        const args = JSON.parse(toolCall.function.arguments || "{}")

        try {
          if (toolCall.function.name === "search_cases") {
            toolResult = await tools.searchCases(args, effectiveStationId)
          } else if (toolCall.function.name === "get_case_dossier") {
            toolResult = await tools.getCaseDossier(args as any, effectiveStationId)
          } else if (toolCall.function.name === "get_person_connections") {
            toolResult = await tools.getPersonConnections(args as any, effectiveStationId)
          } else if (toolCall.function.name === "get_similar_cases") {
            toolResult = await tools.getSimilarCases(args as any, effectiveStationId)
          } else if (toolCall.function.name === "get_hotspot_summary") {
            toolResult = await tools.getHotspotSummary(args as any, effectiveStationId)
          }
        } catch (e) {
          toolResult = { error: "Tool execution failed." }
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(toolResult),
        })
      }

      // Send result back to model
      const secondResponse = await openai.chat.completions.create({
        model: process.env.OPENROUTER_MODEL || "google/gemini-1.5-pro", 
        messages: messages,
      })
      
      finalReply = secondResponse.choices[0].message.content || "No response."
    }

    // Log the audit
    await prisma.auditLog.create({
      data: {
        officerId: session.user.id,
        action: "CHAT_QUERY",
        targetType: "CHAT",
        details: `Queried: ${message.substring(0, 50)}...`
      }
    })

    return NextResponse.json({ reply: finalReply })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
