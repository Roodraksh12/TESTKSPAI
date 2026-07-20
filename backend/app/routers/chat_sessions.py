from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import get_current_user
from app.services import chat_store

router = APIRouter(prefix="/api/chat/sessions", tags=["chat-sessions"])


class CreateSessionRequest(BaseModel):
    activeCaseId: str | None = None


@router.get("")
def list_sessions(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    return {"sessions": chat_store.list_sessions(officer["id"])}


@router.post("")
def create_session(
    payload: CreateSessionRequest, current_user: dict = Depends(get_current_user)
) -> dict:
    officer = current_user["officer"]
    session_id = chat_store.create_session(officer["id"], payload.activeCaseId)
    return {"sessionId": session_id}


@router.get("/{session_id}")
def get_session(session_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    messages = chat_store.get_session_messages(session_id, officer["id"])
    if messages is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"sessionId": session_id, "messages": messages}


@router.delete("/{session_id}")
def delete_session(session_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    if not chat_store.delete_session(session_id, officer["id"]):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}
