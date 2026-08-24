from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.deps import create_access_token, get_current_user, verify_password
from app.services.case_access import (
    create_audit_log,
    load_officer_by_badge,
    load_officer_by_email,
    officer_user_payload,
)
from app.services.db import execute, fetch_all, fetch_one, fetch_scalar, new_id
from app.services.mailer import send_email
from app.services.passwords import hash_password
from app.services.auth_rate_limit import login_attempts

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    badgeId: str
    password: str


class ChangePasswordRequest(BaseModel):
    newPassword: str = Field(min_length=8)


class ForgotPasswordRequest(BaseModel):
    badgeId: str | None = None
    email: str | None = None


@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict:
    badge_id = payload.badgeId.strip()
    client_ip = request.client.host if request.client else "unknown"
    retry_after = login_attempts.retry_after(badge_id, client_ip)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Too many failed sign-in attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    officer = load_officer_by_badge(badge_id)
    if not officer or not verify_password(payload.password, officer["passwordHash"]):
        login_attempts.record_failure(badge_id, client_ip)
        raise HTTPException(status_code=401, detail="Invalid badge ID or password")

    status_val = officer.get("status") or "ACTIVE"
    if status_val == "DISABLED":
        raise HTTPException(status_code=403, detail="Account disabled")
    if status_val == "PENDING_INVITE":
        raise HTTPException(status_code=403, detail="Invitation not activated")

    login_attempts.record_success(badge_id)

    must_change = status_val == "MUST_CHANGE_PASSWORD"
    token = create_access_token(officer, settings, pwd_change_only=must_change)
    create_audit_log(officer["id"], "LOGIN", "OFFICER", officer["id"], "Login success")
    user = officer_user_payload(officer)
    return {
        "token": token,
        "user": user,
        "mustChangePassword": must_change,
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user), settings: Settings = Depends(get_settings)) -> dict:
    officer = current_user["officer"]
    user = officer_user_payload(officer)
    if officer.get("role") == "POLICE_IT":
        user["smtpConfigured"] = settings.smtp_configured
    return {"user": user}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = current_user["officer"]
    if (officer.get("status") or "") != "MUST_CHANGE_PASSWORD":
        raise HTTPException(status_code=400, detail="Password change not required")

    new_hash = hash_password(payload.newPassword)
    execute(
        '''
        UPDATE "Officer"
        SET "passwordHash" = %(passwordHash)s, status = 'ACTIVE'
        WHERE id = %(id)s
        ''',
        {"passwordHash": new_hash, "id": officer["id"]},
    )
    execute(
        '''
        UPDATE "Invitation"
        SET "usedAt" = NOW()
        WHERE "invitedOfficerId" = %(id)s AND "usedAt" IS NULL
        ''',
        {"id": officer["id"]},
    )
    create_audit_log(officer["id"], "PASSWORD_CHANGED", "OFFICER", officer["id"], "Forced password change")
    return {"ok": True, "message": "Password updated. Please sign in again."}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest) -> dict:
    badge = (payload.badgeId or "").strip()
    email = (payload.email or "").strip()
    if not badge and not email:
        raise HTTPException(status_code=400, detail="Provide badgeId or email")

    officer = load_officer_by_badge(badge) if badge else load_officer_by_email(email)
    generic = {
        "ok": True,
        "message": "If an account exists, a reset request was submitted for approval.",
    }
    if not officer:
        return generic

    recent = fetch_scalar(
        '''
        SELECT COUNT(*) FROM "PasswordResetRequest"
        WHERE "officerId" = %(id)s
          AND "requestedAt" >= NOW() - INTERVAL '1 hour'
        ''',
        {"id": officer["id"]},
    )
    if int(recent or 0) >= 3:
        raise HTTPException(status_code=429, detail="Too many reset requests. Try again later.")

    pending = fetch_one(
        '''
        SELECT id FROM "PasswordResetRequest"
        WHERE "officerId" = %(id)s AND status = 'PENDING'
        LIMIT 1
        ''',
        {"id": officer["id"]},
    )
    if pending:
        return generic

    req_id = new_id()
    execute(
        '''
        INSERT INTO "PasswordResetRequest" (id, "officerId", "requestedAt", status)
        VALUES (%(id)s, %(officerId)s, NOW(), 'PENDING')
        ''',
        {"id": req_id, "officerId": officer["id"]},
    )
    create_audit_log(
        officer["id"],
        "RESET_REQUESTED",
        "PASSWORD_RESET",
        req_id,
        f"Reset requested for {officer['badgeId']}",
    )

    it_officer = fetch_one(
        "SELECT email, name FROM \"Officer\" WHERE role = 'POLICE_IT' LIMIT 1"
    )
    if it_officer and it_officer.get("email"):
        send_email(
            it_officer["email"],
            "Password reset request — SCRB Sahayak",
            f"Officer {officer['name']} ({officer['badgeId']}) requested a password reset.\n"
            f"Approve it in Administration.\n",
        )

    path = officer.get("hierarchyPath")
    if path:
        ancestors_list = fetch_all(
            '''
            SELECT email, name FROM "Officer"
            WHERE "hierarchyPath" @> %(path)s::ltree
              AND id <> %(id)s
              AND email IS NOT NULL
            ''',
            {"path": path, "id": officer["id"]},
        )
        for a in ancestors_list:
            send_email(
                a["email"],
                "Subtree password reset request — SCRB Sahayak",
                f"Officer {officer['name']} ({officer['badgeId']}) in your subtree requested a password reset.\n",
            )

    return generic


@router.post("/logout")
def logout(current_user: dict = Depends(get_current_user)) -> dict:
    return {"ok": True}
