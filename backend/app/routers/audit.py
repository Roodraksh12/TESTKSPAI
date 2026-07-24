from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import get_current_user
from app.services import audit

router = APIRouter(prefix="/api/audit", tags=["audit"])


class AuditEventRequest(BaseModel):
    action: str
    targetType: str
    targetId: str | None = None
    details: str | None = None


@router.get("")
def list_audit(current_user: dict = Depends(get_current_user)) -> dict:
    return {"auditLogs": audit.list_audit_logs(current_user["officer"])}


@router.post("")
def record_event(payload: AuditEventRequest, current_user: dict = Depends(get_current_user)) -> dict:
    try:
        audit.record_client_event(
            current_user["officer"], payload.action, payload.targetType, payload.targetId, payload.details
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True}
