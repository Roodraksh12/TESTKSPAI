from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services import investigation_playbooks
from app.services.case_access import create_audit_log, get_case_with_relations, require_case_write
from app.services.db import execute_returning, fetch_all, fetch_one, get_conn, new_id

router = APIRouter(
    prefix="/api/cases/{case_id}/investigation-plan",
    tags=["investigation-playbooks"],
)

TaskStatus = Literal["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED", "NOT_APPLICABLE"]


class TaskUpdateRequest(BaseModel):
    status: TaskStatus
    officerNotes: str | None = Field(default=None, max_length=4_000)


class DocumentDraftRequest(BaseModel):
    templateKey: str = Field(min_length=1, max_length=100)
    taskId: str | None = Field(default=None, max_length=100)
    inputs: dict[str, str] = Field(default_factory=dict)


class DocumentUpdateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=30_000)


def _load_case(case_id: str, officer: dict[str, Any]) -> dict[str, Any]:
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")
    return case


def _require_plan_write(case: dict[str, Any], officer: dict[str, Any]) -> None:
    require_case_write(officer)
    assigned_io_id = case.get("currentIoId")
    if assigned_io_id and assigned_io_id != officer.get("id"):
        raise HTTPException(
            status_code=403,
            detail="Only the assigned Investigating Officer can update this investigation plan",
        )


def _load_plan(case_id: str) -> dict[str, Any] | None:
    plan = fetch_one(
        '''
        SELECT p.*, creator.name AS "createdByName", updater.name AS "updatedByName"
        FROM "CaseInvestigationPlan" p
        JOIN "Officer" creator ON creator.id = p."createdById"
        JOIN "Officer" updater ON updater.id = p."updatedById"
        WHERE p."caseId" = %(caseId)s
        ''',
        {"caseId": case_id},
    )
    if not plan:
        return None
    tasks = fetch_all(
        '''
        SELECT t.*, o.name AS "updatedByName", o."badgeId" AS "updatedByBadgeId"
        FROM "CaseInvestigationTask" t
        JOIN "Officer" o ON o.id = t."updatedById"
        WHERE t."planId" = %(planId)s
        ORDER BY t."sortOrder" ASC
        ''',
        {"planId": plan["id"]},
    )
    counts = {status: 0 for status in ("PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED", "NOT_APPLICABLE")}
    for task in tasks:
        counts[task["status"]] = counts.get(task["status"], 0) + 1
    return {**plan, "tasks": tasks, "summary": {"total": len(tasks), **counts}}


def _load_documents(case_id: str) -> list[dict[str, Any]]:
    return fetch_all(
        '''
        SELECT d.id, d."caseId", d."taskId", d."templateKey", d."templateVersion",
               d."sourceStatus", d.title, d.language, d.content, d.status,
               d."createdById", d."updatedById", d."createdAt", d."updatedAt",
               o.name AS "updatedByName", o."badgeId" AS "updatedByBadgeId"
        FROM "RoutineDocumentDraft" d
        JOIN "Officer" o ON o.id = d."updatedById"
        WHERE d."caseId" = %(caseId)s AND d.status = 'DRAFT'
        ORDER BY d."updatedAt" DESC
        ''',
        {"caseId": case_id},
    )


@router.get("")
def get_investigation_plan(
    case_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    officer = current_user["officer"]
    case = _load_case(case_id, officer)
    available = investigation_playbooks.select_playbook(case.get("crimeType"))
    return {
        "plan": _load_plan(case_id),
        "availableProfile": {
            key: available[key]
            for key in (
                "profileCode",
                "profileVersion",
                "profileTitle",
                "sourceStatus",
                "disclaimer",
                "matchedCrimeProfile",
                "matchedCrimeProfileTitle",
            )
        },
        "documentTemplates": investigation_playbooks.list_document_templates(),
        "documents": _load_documents(case_id),
    }


@router.post("/initialize")
def initialize_investigation_plan(
    case_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    officer = current_user["officer"]
    case = _load_case(case_id, officer)
    _require_plan_write(case, officer)
    existing = _load_plan(case_id)
    if existing:
        return {"plan": existing, "created": False}

    selected = investigation_playbooks.select_playbook(case.get("crimeType"))
    plan_id = new_id()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Serialize initialization for one case so two browser retries cannot
            # create a partial task set or surface a unique-key error.
            cur.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%(caseId)s))",
                {"caseId": case_id},
            )
            cur.execute(
                'SELECT id FROM "CaseInvestigationPlan" WHERE "caseId" = %(caseId)s',
                {"caseId": case_id},
            )
            if cur.fetchone():
                conn.commit()
                return {"plan": _load_plan(case_id), "created": False}
            cur.execute(
                '''
                INSERT INTO "CaseInvestigationPlan" (
                    id, "caseId", "profileCode", "profileVersion", "profileTitle",
                    "sourceStatus", disclaimer, "createdById", "updatedById",
                    "createdAt", "updatedAt"
                ) VALUES (
                    %(id)s, %(caseId)s, %(profileCode)s, %(profileVersion)s, %(profileTitle)s,
                    %(sourceStatus)s, %(disclaimer)s, %(officerId)s, %(officerId)s,
                    %(now)s, %(now)s
                )
                ''',
                {
                    "id": plan_id,
                    "caseId": case_id,
                    "profileCode": selected["profileCode"],
                    "profileVersion": selected["profileVersion"],
                    "profileTitle": (
                        f'{selected["profileTitle"]} · {selected["matchedCrimeProfileTitle"]}'
                    ),
                    "sourceStatus": selected["sourceStatus"],
                    "disclaimer": selected["disclaimer"],
                    "officerId": officer["id"],
                    "now": now,
                },
            )
            for step in selected["steps"]:
                cur.execute(
                    '''
                    INSERT INTO "CaseInvestigationTask" (
                        id, "planId", "caseId", "taskKey", phase, title, guidance,
                        rationale, "sortOrder", status, "documentTemplateKey",
                        "updatedById", "createdAt", "updatedAt"
                    ) VALUES (
                        %(id)s, %(planId)s, %(caseId)s, %(taskKey)s, %(phase)s,
                        %(title)s, %(guidance)s, %(rationale)s, %(sortOrder)s,
                        'PENDING', %(documentTemplateKey)s, %(officerId)s, %(now)s, %(now)s
                    )
                    ''',
                    {
                        "id": new_id(),
                        "planId": plan_id,
                        "caseId": case_id,
                        "taskKey": step["key"],
                        "phase": step["phase"],
                        "title": step["title"],
                        "guidance": step["guidance"],
                        "rationale": step.get("rationale"),
                        "sortOrder": step["sortOrder"],
                        "documentTemplateKey": step.get("documentTemplateKey"),
                        "officerId": officer["id"],
                        "now": now,
                    },
                )
        conn.commit()

    create_audit_log(
        officer["id"],
        "INITIALIZE_INVESTIGATION_PLAN",
        "CASE",
        case_id,
        (
            f'Created {selected["sourceStatus"]} playbook '
            f'{selected["profileCode"]} v{selected["profileVersion"]}'
        ),
    )
    return {"plan": _load_plan(case_id), "created": True}


@router.patch("/tasks/{task_id}")
def update_investigation_task(
    case_id: str,
    task_id: str,
    payload: TaskUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    officer = current_user["officer"]
    case = _load_case(case_id, officer)
    _require_plan_write(case, officer)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    task = execute_returning(
        '''
        UPDATE "CaseInvestigationTask"
        SET status = %(status)s,
            "officerNotes" = %(officerNotes)s,
            "completedAt" = CASE
                WHEN %(status)s = 'COMPLETED' THEN COALESCE("completedAt", %(now)s)
                ELSE NULL
            END,
            "updatedById" = %(officerId)s,
            "updatedAt" = %(now)s
        WHERE id = %(taskId)s AND "caseId" = %(caseId)s
        RETURNING *
        ''',
        {
            "status": payload.status,
            "officerNotes": (payload.officerNotes or "").strip() or None,
            "now": now,
            "officerId": officer["id"],
            "taskId": task_id,
            "caseId": case_id,
        },
    )
    if not task:
        raise HTTPException(status_code=404, detail="Investigation task not found")
    create_audit_log(
        officer["id"],
        "UPDATE_INVESTIGATION_TASK",
        "CASE",
        case_id,
        f'Updated task {task["taskKey"]} to {task["status"]}',
    )
    return {"task": task}


def _validate_document_inputs(inputs: dict[str, str]) -> dict[str, str]:
    if len(inputs) > 12:
        raise HTTPException(status_code=422, detail="A document draft accepts at most 12 fields")
    normalized: dict[str, str] = {}
    for key, value in inputs.items():
        clean_key = key.strip()
        clean_value = value.strip()
        if not clean_key or len(clean_key) > 100:
            raise HTTPException(status_code=422, detail="Document field name is invalid")
        if len(clean_value) > 5_000:
            raise HTTPException(status_code=422, detail=f"Document field {clean_key} is too long")
        normalized[clean_key] = clean_value
    return normalized


@router.post("/documents")
def create_routine_document_draft(
    case_id: str,
    payload: DocumentDraftRequest,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    officer = current_user["officer"]
    case = _load_case(case_id, officer)
    _require_plan_write(case, officer)
    plan = _load_plan(case_id)
    if not plan:
        raise HTTPException(status_code=409, detail="Initialize the investigation plan first")

    task_id = payload.taskId
    if task_id:
        task = fetch_one(
            'SELECT id FROM "CaseInvestigationTask" WHERE id = %(id)s AND "caseId" = %(caseId)s',
            {"id": task_id, "caseId": case_id},
        )
        if not task:
            raise HTTPException(status_code=404, detail="Investigation task not found")

    inputs = _validate_document_inputs(payload.inputs)
    case_context = {
        "firNumber": case.get("firNumber"),
        "crimeType": case.get("crimeType"),
        "incidentDate": str(case.get("incidentDate") or "Not recorded")[:10],
        "caseSummary": case.get("summary") or "Not recorded",
        "stationName": (case.get("station") or {}).get("name") or "Not recorded",
        "officerName": officer.get("name") or "Not recorded",
        "officerBadgeId": officer.get("badgeId") or "Not recorded",
    }
    try:
        rendered = investigation_playbooks.render_document(
            payload.templateKey,
            case_context=case_context,
            officer_inputs=inputs,
        )
    except investigation_playbooks.DocumentInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    draft_id = new_id()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    draft = execute_returning(
        '''
        INSERT INTO "RoutineDocumentDraft" (
            id, "caseId", "taskId", "templateKey", "templateVersion",
            "sourceStatus", title, language, content, "inputData", status,
            "createdById", "updatedById", "createdAt", "updatedAt"
        ) VALUES (
            %(id)s, %(caseId)s, %(taskId)s, %(templateKey)s, %(templateVersion)s,
            %(sourceStatus)s, %(title)s, %(language)s, %(content)s, %(inputData)s::jsonb,
            'DRAFT', %(officerId)s, %(officerId)s, %(now)s, %(now)s
        )
        RETURNING *
        ''',
        {
            "id": draft_id,
            "caseId": case_id,
            "taskId": task_id,
            "templateKey": rendered["templateKey"],
            "templateVersion": rendered["templateVersion"],
            "sourceStatus": rendered["sourceStatus"],
            "title": rendered["title"],
            "language": rendered["language"],
            "content": rendered["content"],
            "inputData": json.dumps(rendered["inputData"]),
            "officerId": officer["id"],
            "now": now,
        },
    )
    create_audit_log(
        officer["id"],
        "CREATE_ROUTINE_DOCUMENT_DRAFT",
        "CASE",
        case_id,
        (
            f'Created provisional template {rendered["templateKey"]} '
            f'v{rendered["templateVersion"]}; not filed or transmitted'
        ),
    )
    return {"document": draft, "disclaimer": rendered["disclaimer"]}


@router.put("/documents/{document_id}")
def update_routine_document_draft(
    case_id: str,
    document_id: str,
    payload: DocumentUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    officer = current_user["officer"]
    case = _load_case(case_id, officer)
    _require_plan_write(case, officer)
    content = payload.content.strip()
    existing = fetch_one(
        'SELECT "sourceStatus" FROM "RoutineDocumentDraft" WHERE id = %(id)s AND "caseId" = %(caseId)s',
        {"id": document_id, "caseId": case_id},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Routine document draft not found")
    if existing["sourceStatus"] == "PROVISIONAL_DEMO" and not content.startswith(
        "DEMO DRAFT — NOT AN OFFICIAL DEPARTMENTAL FORMAT"
    ):
        raise HTTPException(
            status_code=422,
            detail="The provisional non-official label cannot be removed from this demo draft",
        )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    draft = execute_returning(
        '''
        UPDATE "RoutineDocumentDraft"
        SET content = %(content)s, "updatedById" = %(officerId)s, "updatedAt" = %(now)s
        WHERE id = %(id)s AND "caseId" = %(caseId)s AND status = 'DRAFT'
        RETURNING *
        ''',
        {
            "content": content,
            "officerId": officer["id"],
            "now": now,
            "id": document_id,
            "caseId": case_id,
        },
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Routine document draft not found")
    create_audit_log(
        officer["id"],
        "UPDATE_ROUTINE_DOCUMENT_DRAFT",
        "CASE",
        case_id,
        f"Edited routine document draft {document_id}; not filed or transmitted",
    )
    return {"document": draft}
