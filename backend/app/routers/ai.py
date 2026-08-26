from __future__ import annotations

import json
import re
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services import chat_store, intake_intel
from app.services.ai_tools import (
    NEEDS_CASE_TOOLS,
    execute_tool,
    filter_tools_for_role,
    serialize_tool_result,
)
from app.services.case_access import create_audit_log, get_case_with_relations, require_fir_upload
from app.services.ai_privacy import PrivacyContext, known_values_from_case, merge_public_privacy
from app.services.openrouter import chat_completion_with_metadata, chat_json

router = APIRouter(prefix="/api", tags=["ai"])

MAX_TOOL_ROUNDS = 3
FIR_NUMBER_RE = re.compile(r"FIR/\d{4}/[A-Z0-9-]+")

CHAT_SYSTEM_PROMPT = '''You are an investigation assistant for Karnataka State Police, SCRB (Sahayak).
Your job after a case is uploaded is operational: intake briefing, identity leads, MO-similar cases, legal framing, 24–72h checklist, and draft notes for SHO/SP.

Rules:
- CRITICAL LANGUAGE RULE: If the user speaks or types in Kannada (even if it is romanized/English-script Kannada), you MUST reply entirely in proper, native Kannada script (ಕನ್ನಡ ಲಿಪಿ) with correct professional grammar. If the user speaks or types in English, you MUST reply entirely in English. Do not mix languages unless explicitly asked to translate.
- Never state a fact about a case or person without it coming from a tool result; if tools return nothing relevant, say so plainly instead of guessing.
- Never assert a suspect match as certain — always phrase as a lead with confidence %, officer must confirm/reject.
- When discussing patterns, ground only in method, timing, location, prior record — never caste, religion, or community.
- Use search_cases when the officer asks to find or list case records. Use get_crime_statistics for counts, distributions, trends, busiest stations/districts, or incident-time patterns. Never calculate a total from a truncated search_cases list.
- State that statistics are limited to the requesting officer's permitted jurisdiction, and do not infer causes from an observed correlation.
- Prefer run_case_intake when an officer opens a newly saved case or asks "what next" / "brief me".
- Prefer draft_case_summary for SP/SHO notes — label clearly as DRAFT not filed.
- Keep responses concise and operational (bullets, numbered actions).
- You have read-only database tools. Never claim to confirm, reject, save, file, send or modify a record; direct the officer to the relevant reviewed UI action.
- STRICT DOMAIN RESTRICTION: You are strictly a police investigation assistant. If the user asks a question unrelated to policing, crime, law enforcement, or investigations, you must reply with exactly this phrase and nothing else: "Ask relevant questions"'''


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8_000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4_000)
    pageContext: str | None = Field(default=None, max_length=12_000)
    activeCaseId: str | None = Field(default=None, max_length=100)
    stationId: str | None = Field(default=None, max_length=100)
    sessionId: str | None = Field(default=None, max_length=100)
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=30)
    # The floating quick-ask pill is a one-shot lookup about the page in front of
    # the officer, not a conversation. Those turns are deliberately not written
    # to ChatSession/ChatMessage so the saved history stays a record of real
    # investigative threads. The AuditLog entry is still written either way —
    # every query against case data remains on record regardless of surface.
    persist: bool = True


class DraftFirRequest(BaseModel):
    notes: str = Field(min_length=1, max_length=20_000)


class PredictStepsRequest(BaseModel):
    caseId: str = Field(min_length=1, max_length=100)


def extract_case_sources(value: Any) -> list[dict[str, str]]:
    """Collect navigable case references from a jurisdiction-scoped tool result."""

    found: dict[str, dict[str, str]] = {}

    def visit(item: Any) -> None:
        if isinstance(item, list):
            for child in item:
                visit(child)
            return
        if not isinstance(item, dict):
            return

        fir_number = item.get("firNumber")
        case_id = item.get("caseId") or item.get("id")
        if (
            isinstance(fir_number, str)
            and FIR_NUMBER_RE.fullmatch(fir_number)
            and isinstance(case_id, str)
            and case_id
        ):
            found.setdefault(
                fir_number,
                {"id": case_id, "firNumber": fir_number},
            )

        for child in item.values():
            if isinstance(child, (dict, list)):
                visit(child)

    visit(value)
    return list(found.values())


@router.post("/chat")
async def chat(payload: ChatRequest, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]

    # The general operational audit deliberately stores no prompt text. Detailed
    # provider/redaction metadata is written separately to AiRequestAudit.
    create_audit_log(
        officer["id"],
        "CHAT_QUERY",
        "CHAT",
        details=(
            f"AI request received; persisted={payload.persist}; "
            f"caseContext={bool(payload.activeCaseId)}; privacyPolicy=backend-enforced"
        ),
    )

    # Persist the question before the model runs, for the same reason the audit
    # row is written first: a conversation that errored still happened.
    session_id: str | None = None
    if payload.persist:
        session_id = chat_store.ensure_session(
            officer["id"], payload.sessionId, payload.activeCaseId
        )
        chat_store.append_message(session_id, chat_store.ROLE_USER, payload.message)

    active_case = (
        get_case_with_relations(payload.activeCaseId, officer)
        if payload.activeCaseId
        else None
    )
    known_sensitive_values = known_values_from_case(active_case)

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
            "role": item.role,
            "content": item.content,
        }
        for item in payload.history
    ]

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        *formatted_history,
        {"role": "user", "content": payload.message},
    ]

    tools_used: list[str] = []
    sources: list[str] = []
    source_cases: dict[str, dict[str, str]] = {}
    final_reply = ""
    privacy_events: list[dict[str, Any]] = []

    def privacy_context() -> PrivacyContext:
        return PrivacyContext(
            purpose="CONVERSATIONAL_ASSISTANT",
            officer_id=officer["id"],
            case_ids=(payload.activeCaseId,) if payload.activeCaseId else (),
            session_id=session_id,
            tool_names=tuple(dict.fromkeys(tools_used)),
            known_sensitive_values=known_sensitive_values,
        )

    for _round in range(MAX_TOOL_ROUNDS):
        completion = await chat_completion_with_metadata(
            messages,
            tools=filtered_tools if filtered_tools else None,
            tool_choice="auto" if filtered_tools else None,
            privacy_context=privacy_context(),
        )
        privacy_events.append(completion.privacy)
        response_message = completion.content
        if not isinstance(response_message, dict):
            final_reply = response_message or ""
            break

        final_reply = response_message.get("content") or ""
        tool_calls = response_message.get("tool_calls") or []
        if not tool_calls:
            break

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
                    officer,
                )
            except Exception:
                tool_result = {"error": "Tool execution failed."}

            if tool_name:
                tools_used.append(tool_name)
            for source_case in extract_case_sources(tool_result):
                source_cases.setdefault(source_case["firNumber"], source_case)
            serialized = serialize_tool_result(tool_result)
            sources.extend(FIR_NUMBER_RE.findall(serialized))

            messages.append(
                {
                    "tool_call_id": tool_call.get("id"),
                    "role": "tool",
                    "content": serialized,
                }
            )
    else:
        # Exhausted MAX_TOOL_ROUNDS with the model still requesting tools —
        # force a final answer with no tool access so the request can't hang.
        final_completion = await chat_completion_with_metadata(
            messages,
            privacy_context=privacy_context(),
        )
        privacy_events.append(final_completion.privacy)
        final_response = final_completion.content
        final_reply = (
            final_response.get("content") or "No response."
            if isinstance(final_response, dict)
            else final_response or "No response."
        )

    reply = final_reply or "No response."
    deduped_sources = list(dict.fromkeys(sources))[:6]
    navigable_sources = [
        source_cases[fir_number]
        for fir_number in deduped_sources
        if fir_number in source_cases
    ]
    if session_id:
        chat_store.append_message(
            session_id,
            chat_store.ROLE_ASSISTANT,
            reply,
            deduped_sources,
            privacy_metadata=merge_public_privacy(privacy_events),
        )

    return {
        "reply": reply,
        "toolsUsed": list(dict.fromkeys(tools_used)),
        "sources": deduped_sources,
        "sourceCases": navigable_sources,
        "sessionId": session_id,
        "privacy": merge_public_privacy(privacy_events),
    }


class QuickAskRequest(BaseModel):
    message: str
    """Human-readable description of what the officer is looking at."""
    pageContext: str | None = None
    activeCaseId: str | None = None


@router.post("/chat/quick")
async def quick_ask(
    payload: QuickAskRequest, current_user: dict = Depends(get_current_user)
) -> dict:
    """One-shot question about the current page.

    Same tools and same jurisdiction scoping as the main copilot, but nothing is
    written to the conversation history: this is a glance, not a thread.
    """
    return await chat(
        ChatRequest(
            message=payload.message,
            pageContext=payload.pageContext,
            activeCaseId=payload.activeCaseId,
            history=[],
            persist=False,
        ),
        current_user,
    )


@router.post("/ai/draft-fir")
async def draft_fir(payload: DraftFirRequest, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    require_fir_upload(officer)
    prompt = f'''You are an expert police intake system. You are given raw field notes from a police officer.
Draft a highly structured, professional First Information Report (FIR) based on these notes.

Extract accused names, victim if any, location, incident date, crime type, narrative, and modus operandi.

Return JSON with keys: crimeType, incidentDate, location, accusedNames, victimName, narrativeSummary, modusOperandi.

Raw Notes:
"{payload.notes}"'''

    extracted = await chat_json(
        [{"role": "user", "content": prompt}],
        privacy_context=PrivacyContext(
            purpose="FIELD_NOTE_EXTRACTION",
            officer_id=officer["id"],
        ),
    )
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
        station_id=officer.get("stationId"),
    )
    mo_similar = intake_intel.find_mo_similar_cases(
        station_id=officer.get("stationId"),
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

    result = await chat_json(
        [{"role": "user", "content": prompt}],
        privacy_context=PrivacyContext(
            purpose="NEXT_STEP_SUGGESTION",
            officer_id=current_user["officer"]["id"],
            case_ids=(payload.caseId,),
            known_sensitive_values=known_values_from_case(case_data),
        ),
    )
    steps = result.get("steps") or []
    return {"steps": steps[:3]}
