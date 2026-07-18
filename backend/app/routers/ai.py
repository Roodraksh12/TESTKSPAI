from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services import intake_intel
from app.services.ai_tools import (
    NEEDS_CASE_TOOLS,
    execute_tool,
    filter_tools_for_role,
    serialize_tool_result,
)
from app.services.case_access import create_audit_log, get_case_with_relations
from app.services.openrouter import chat_completion, chat_json

router = APIRouter(prefix="/api", tags=["ai"])

CHAT_SYSTEM_PROMPT = '''You are an investigation assistant for Karnataka State Police, SCRB (Sahayak).
Your job after a case is uploaded is operational: intake briefing, identity leads, MO-similar cases, legal framing, 24–72h checklist, and draft notes for SHO/SP.

Rules:
- Always answer in the language the officer used (English or Kannada); if asked, translate freely.
- Never state a fact about a case or person without it coming from a tool result; if tools return nothing relevant, say so plainly instead of guessing.
- Never assert a suspect match as certain — always phrase as a lead with confidence %, officer must confirm/reject.
- When discussing patterns, ground only in method, timing, location, prior record — never caste, religion, or community.
- Prefer run_case_intake when an officer opens a newly saved case or asks "what next" / "brief me".
- Prefer draft_case_summary for SP/SHO notes — label clearly as DRAFT not filed.
- Keep responses concise and operational (bullets, numbered actions).
- If matchId is available and officer says confirm/reject a match, use update_match_status.'''


class ChatRequest(BaseModel):
    message: str
    pageContext: str | None = None
    activeCaseId: str | None = None
    stationId: str | None = None
    history: list[dict] = Field(default_factory=list)


class DraftFirRequest(BaseModel):
    notes: str


class PredictStepsRequest(BaseModel):
    caseId: str


@router.post("/chat")
async def chat(payload: ChatRequest, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    effective_station_id = (
        payload.stationId if is_sp and payload.stationId else officer["stationId"]
    )

    context_addition = ""
    if payload.pageContext:
        ctx = (
            payload.pageContext
            if isinstance(payload.pageContext, str)
            else json.dumps(payload.pageContext)
        )
        context_addition = (
            f"\n\n[SYSTEM CONTEXT: The user is currently viewing the following page/data: {ctx}. "
            'If the user asks about "this case", "this page", or "this data", refer to this context.]'
        )

    case_hint = ""
    if payload.activeCaseId:
        case_hint = (
            f"\n\n[ACTIVE CASE ID: {payload.activeCaseId}. "
            'Prefer tools with this caseId when the officer says "this case" / "this FIR".]'
        )

    system_prompt = CHAT_SYSTEM_PROMPT + context_addition + case_hint
    filtered_tools = filter_tools_for_role(officer.get("role", "INSPECTOR"))

    formatted_history = [
        {
            "role": "assistant" if item.get("role") == "assistant" else "user",
            "content": item.get("content") or "",
        }
        for item in payload.history
    ]

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        *formatted_history,
        {"role": "user", "content": payload.message},
    ]

    response_message = await chat_completion(
        messages,
        tools=filtered_tools if filtered_tools else None,
        tool_choice="auto" if filtered_tools else None,
    )
    if not isinstance(response_message, dict):
        return {"reply": response_message or ""}

    final_reply = response_message.get("content") or ""
    tool_calls = response_message.get("tool_calls") or []

    if tool_calls:
        messages.append(response_message)
        for tool_call in tool_calls:
            fn = tool_call.get("function") or {}
            tool_name = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}

            if payload.activeCaseId and isinstance(args, dict) and not args.get("caseId"):
                if tool_name in NEEDS_CASE_TOOLS:
                    args["caseId"] = payload.activeCaseId

            try:
                tool_result = await execute_tool(
                    tool_name,
                    args,
                    effective_station_id,
                    officer["id"],
                    is_sp,
                )
            except Exception:
                tool_result = {"error": "Tool execution failed."}

            messages.append(
                {
                    "tool_call_id": tool_call.get("id"),
                    "role": "tool",
                    "content": serialize_tool_result(tool_result),
                }
            )

        second_response = await chat_completion(messages)
        if isinstance(second_response, dict):
            final_reply = second_response.get("content") or "No response."
        else:
            final_reply = second_response or "No response."

    create_audit_log(
        officer["id"],
        "CHAT_QUERY",
        "CHAT",
        details=f'Queried: {payload.message[:80]}...',
    )
    return {"reply": final_reply}


@router.post("/ai/draft-fir")
async def draft_fir(payload: DraftFirRequest, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    prompt = f'''You are an expert police intake system. You are given raw field notes from a police officer.
Draft a highly structured, professional First Information Report (FIR) based on these notes.

Extract accused names, victim if any, location, incident date, crime type, narrative, and modus operandi.

Return JSON with keys: crimeType, incidentDate, location, accusedNames, victimName, narrativeSummary, modusOperandi.

Raw Notes:
"{payload.notes}"'''

    extracted = await chat_json([{"role": "user", "content": prompt}])
    extracted_data = {
        "crimeType": extracted.get("crimeType", "Unknown"),
        "incidentDate": extracted.get("incidentDate", "Unknown"),
        "location": extracted.get("location", ""),
        "accusedNames": extracted.get("accusedNames") or [],
        "victimName": extracted.get("victimName"),
        "narrativeSummary": extracted.get("narrativeSummary", ""),
        "modusOperandi": extracted.get("modusOperandi", ""),
    }

    identity = intake_intel.find_identity_matches(
        names=[
            *extracted_data["accusedNames"],
            *([extracted_data["victimName"]] if extracted_data.get("victimName") else []),
        ],
        station_id=officer["stationId"],
    )
    mo_similar = intake_intel.find_mo_similar_cases(
        station_id=officer["stationId"],
        crime_type=extracted_data["crimeType"],
        summary=extracted_data["narrativeSummary"],
        modus_operandi=extracted_data["modusOperandi"],
        take=4,
    )

    possible_matches = [
        *[
            {
                "personId": m["personId"],
                "name": m["name"],
                "reason": m["reason"],
                "confidenceScore": m["confidenceScore"],
                "isMoMatch": False,
            }
            for m in identity
        ],
        *[
            {
                "personId": None,
                "name": m["firNumber"],
                "reason": f'MO_SIMILAR: {m["reason"]}',
                "confidenceScore": m["similarityScore"],
                "isMoMatch": True,
            }
            for m in mo_similar
        ],
    ]

    return {
        "extractedData": extracted_data,
        "rawText": payload.notes,
        "possibleMatches": possible_matches,
    }


@router.post("/ai/predict-steps")
async def predict_steps(payload: PredictStepsRequest, current_user: dict = Depends(get_current_user)) -> dict:
    case_data = get_case_with_relations(payload.caseId, current_user["officer"])
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")

    persons = ", ".join(
        f'{cp["person"]["name"]} ({cp["role"]})' for cp in case_data.get("casePersons", [])
    )
    prompt = f'''You are a senior investigating officer analyzing a case dossier.
Case: {case_data["firNumber"]} ({case_data["crimeType"]})
Summary: {case_data.get("summary")}
Persons involved: {persons}

Predict the top 3 most actionable, specific next steps for the investigating officer. Do not give generic advice. Give highly tactical steps based on the entities and crime type.

Return JSON with key "steps" as an array of objects with id (4-letter string), text, rationale. Max 3 steps.'''

    result = await chat_json([{"role": "user", "content": prompt}])
    steps = result.get("steps") or []
    return {"steps": steps[:3]}
