from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services import deadline_engine

router = APIRouter(prefix="/api", tags=["deadlines"])


@router.get("/deadlines")
def deadlines(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    return deadline_engine.get_compliance_board(is_sp, officer["stationId"])
