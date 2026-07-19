from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.deps import create_access_token, get_current_user, verify_password
from app.services.case_access import load_officer_by_badge, officer_user_payload

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    badgeId: str
    password: str


@router.post("/login")
def login(payload: LoginRequest, settings: Settings = Depends(get_settings)) -> dict:
    officer = load_officer_by_badge(payload.badgeId)
    if not officer or not verify_password(payload.password, officer["passwordHash"]):
        raise HTTPException(status_code=401, detail="Invalid badge ID or password")

    token = create_access_token(officer, settings)
    return {"token": token, "user": officer_user_payload(officer)}


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)) -> dict:
    return {"user": officer_user_payload(current_user["officer"])}
