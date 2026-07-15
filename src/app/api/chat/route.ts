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

    const { message, stationId, history = [], pageContext, activeCaseId } = await req.json()
    const isSp = session.user.role === "SP"
    const effectiveStationId = isSp && stationId ? stationId : session.user.stationId

    const contextAddition = pageContext
      ? `\n\n[SYSTEM CONTEXT: The user is currently viewing the following page/data: ${typeof pageContext === "string" ? pageContext : JSON.stringify(pageContext)}. If the user asks about "this case", "this page", or "this data", refer to this context.]`
      : ""

    const caseHint = activeCaseId
      ? `\n\n[ACTIVE CASE ID: ${activeCaseId}. Prefer tools with this caseId when the officer says "this case" / "this FIR".]`
      : ""

    const systemPrompt = `You are an investigation assistant for Karnataka State Police, SCRB (Sahayak).
Your job after a case is uploaded is operational: intake briefing, identity leads, MO-similar cases, legal framing, 24–72h checklist, and draft notes for SHO/SP.

Rules:
- Always answer in the language the officer used (English or Kannada); if asked, translate freely.
- Never state a fact about a case or person without it coming from a tool result; if tools return nothing relevant, say so plainly instead of guessing.
- Never assert a suspect match as certain — always phrase as a lead with confidence %, officer must confirm/reject.
- When discussing patterns, ground only in method, timing, location, prior record — never caste, religion, or community.
- Prefer run_case_intake when an officer opens a newly saved case or asks "what next" / "brief me".
- Prefer draft_case_summary for SP/SHO notes — label clearly as DRAFT not filed.
- Keep responses concise and operational (bullets, numbered actions).
- If matchId is available and officer says confirm/reject a match, use update_match_status.${contextAddition}${caseHint}`

    const availableTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "search_cases",
          description: "Search cases by crime type or status at the officer's station.",
          parameters: {
            type: "object",
            properties: {
              crimeType: { type: "string" },
              status: { type: "string" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_case_dossier",
          description: "Get full details of a specific case including persons and matches.",
          parameters: {
            type: "object",
            properties: { caseId: { type: "string" } },
            required: ["caseId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "run_case_intake",
          description:
            "Run full post-upload intake for a case: identity leads, MO-similar cases, legal framing, 24h checklist, hotspot context. Use after FIR save or when officer asks for intake / what next on a case.",
          parameters: {
            type: "object",
            properties: { caseId: { type: "string" } },
            required: ["caseId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "find_identity_matches",
          description: "Find prior persons/cases matching names/phones on a case (leads only).",
          parameters: {
            type: "object",
            properties: {
              caseId: { type: "string" },
              names: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "find_mo_similar_cases",
          description: "Find cases with similar modus operandi / narrative at the station.",
          parameters: {
            type: "object",
            properties: { caseId: { type: "string" } },
            required: ["caseId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_investigation_checklist",
          description: "Get ordered 0–72h investigation checklist for a case or crime type.",
          parameters: {
            type: "object",
            properties: {
              caseId: { type: "string" },
              crimeType: { type: "string" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "draft_case_summary",
          description: "Draft a grounded SP/SHO/IO progress note from case record only (not filed).",
          parameters: {
            type: "object",
            properties: {
              caseId: { type: "string" },
              audience: { type: "string", enum: ["SP", "SHO", "IO"] },
            },
            required: ["caseId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "suggest_legal_sections",
          description: "Suggest IPC/BNS framing and evidence still needed for a case.",
          parameters: {
            type: "object",
            properties: {
              caseId: { type: "string" },
              crimeType: { type: "string" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "update_match_status",
          description: "Confirm or reject a pending identity/MO match (officer decision).",
          parameters: {
            type: "object",
            properties: {
              matchId: { type: "string" },
              status: { type: "string", enum: ["CONFIRMED", "REJECTED"] },
            },
            required: ["matchId", "status"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_person_connections",
          description: "Get network connections for a person.",
          parameters: {
            type: "object",
            properties: { personId: { type: "string" } },
            required: ["personId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_similar_cases",
          description: "Alias for MO-similar cases for a given case id.",
          parameters: {
            type: "object",
            properties: { caseId: { type: "string" } },
            required: ["caseId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_hotspot_summary",
          description: "Get hotspot and anomaly alerts for the station.",
          parameters: {
            type: "object",
            properties: { timeframe: { type: "string" } },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "fetch_ipc_section",
          description: "Look up a specific IPC or BNS section text.",
          parameters: {
            type: "object",
            properties: {
              sectionQuery: { type: "string", description: "e.g. '379' or '392'" },
            },
            required: ["sectionQuery"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "extract_entities",
          description: "Heuristic extract phones/vehicles from text.",
          parameters: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
        },
      },
    ]

    // Role uses Prisma enum: CONSTABLE | INSPECTOR | SP
    const filteredTools = availableTools.filter((tool: any) => {
      if (session.user.role === "CONSTABLE") {
        const restricted = ["get_hotspot_summary", "get_person_connections"]
        if (restricted.includes(tool.function.name)) return false
      }
      return true
    })

    const formattedHistory = history.map((h: any) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: h.content || "",
    }))

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...formattedHistory,
      { role: "user", content: message },
    ]

    const model = process.env.OPENROUTER_MODEL || "google/gemini-1.5-pro"

    const response = await openai.chat.completions.create({
      model,
      messages,
      tools: filteredTools.length > 0 ? filteredTools : undefined,
      tool_choice: filteredTools.length > 0 ? "auto" : "none",
    })

    const responseMessage = response.choices[0].message
    let finalReply = responseMessage.content || ""

    if (responseMessage.tool_calls) {
      messages.push(responseMessage)

      for (const toolCall of responseMessage.tool_calls as any[]) {
        let toolResult: unknown = {}
        const args = JSON.parse(toolCall.function.arguments || "{}")
        // Inject active case when model omits caseId
        if (activeCaseId && args && typeof args === "object" && !args.caseId) {
          const needsCase = [
            "get_case_dossier",
            "run_case_intake",
            "find_identity_matches",
            "find_mo_similar_cases",
            "get_investigation_checklist",
            "draft_case_summary",
            "suggest_legal_sections",
            "get_similar_cases",
          ]
          if (needsCase.includes(toolCall.function.name)) {
            args.caseId = activeCaseId
          }
        }

        try {
          switch (toolCall.function.name) {
            case "search_cases":
              toolResult = await tools.searchCases(args, effectiveStationId)
              break
            case "get_case_dossier":
              toolResult = await tools.getCaseDossier(args, effectiveStationId, isSp)
              break
            case "run_case_intake":
              toolResult = await tools.runCaseIntake(args, effectiveStationId, isSp)
              break
            case "find_identity_matches":
              toolResult = await tools.findIdentityMatchesTool(args, effectiveStationId, isSp)
              break
            case "find_mo_similar_cases":
              toolResult = await tools.findMoSimilarCasesTool(args, effectiveStationId, isSp)
              break
            case "get_investigation_checklist":
              toolResult = await tools.getInvestigationChecklistTool(args, effectiveStationId, isSp)
              break
            case "draft_case_summary":
              toolResult = await tools.draftCaseSummaryTool(args, effectiveStationId, isSp)
              break
            case "suggest_legal_sections":
              toolResult = await tools.suggestLegalSectionsTool(args, effectiveStationId, isSp)
              break
            case "update_match_status":
              toolResult = await tools.updateMatchStatusTool(
                args,
                effectiveStationId,
                session.user.id,
                isSp
              )
              break
            case "get_person_connections":
              toolResult = await tools.getPersonConnections(args, effectiveStationId)
              break
            case "get_similar_cases":
              toolResult = await tools.getSimilarCases(args, effectiveStationId)
              break
            case "get_hotspot_summary":
              toolResult = await tools.getHotspotSummary(args, effectiveStationId)
              break
            case "fetch_ipc_section":
              toolResult = await tools.fetchIpcSection(args, effectiveStationId)
              break
            case "extract_entities":
              toolResult = await tools.extractEntities(args, effectiveStationId)
              break
            default:
              toolResult = { error: `Unknown tool: ${toolCall.function.name}` }
          }
        } catch (e) {
          console.error("Tool error", toolCall.function.name, e)
          toolResult = { error: "Tool execution failed." }
        }

        // Prefer markdown field from intake for cleaner second-pass
        const content =
          toolResult &&
          typeof toolResult === "object" &&
          toolResult !== null &&
          "markdown" in toolResult
            ? JSON.stringify({
                ...toolResult,
                // keep full object but model should prefer markdown
              })
            : JSON.stringify(toolResult)

        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content,
        })
      }

      const secondResponse = await openai.chat.completions.create({
        model,
        messages,
      })

      finalReply = secondResponse.choices[0].message.content || "No response."
    }

    await prisma.auditLog.create({
      data: {
        officerId: session.user.id,
        action: "CHAT_QUERY",
        targetType: "CHAT",
        details: `Queried: ${String(message).substring(0, 80)}...`,
      },
    })

    return NextResponse.json({ reply: finalReply })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
