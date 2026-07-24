from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.services.case_access import load_officer_by_id
from app.services.passwords import generate_temp_password, hash_password  # noqa: F401

bearer = HTTPBearer(auto_error=True)

PWD_CHANGE_ALLOWLIST = {
    "/api/auth/change-password",
    "/api/auth/me",
    "/api/auth/logout",
}


def create_access_token(
    officer: dict[str, Any],
    settings: Settings,
    *,
    pwd_change_only: bool = False,
    ttl: timedelta | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expires = ttl or (timedelta(hours=2) if pwd_change_only else timedelta(days=7))
    payload = {
        "sub": officer["id"],
        "badgeId": officer["badgeId"],
        "role": officer["role"],
        "stationId": officer.get("stationId"),
        "districtId": officer.get("districtId"),
        "name": officer["name"],
        "pwd_change_only": pwd_change_only,
        "iat": now,
        "exp": now + expires,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    officer_id = payload.get("sub")
    if not officer_id:
        raise HTTPException(status_code=401, detail="Invalid token subject")

    officer = load_officer_by_id(officer_id)
    if not officer:
        raise HTTPException(status_code=403, detail="Officer profile not found")

    status_val = officer.get("status") or "ACTIVE"
    if status_val == "DISABLED":
        raise HTTPException(status_code=403, detail="Account disabled")

    path = request.url.path.rstrip("/") or "/"
    must_change = status_val == "MUST_CHANGE_PASSWORD" or bool(payload.get("pwd_change_only"))
    if must_change and path not in PWD_CHANGE_ALLOWLIST:
        raise HTTPException(
            status_code=403,
            detail="Password change required before accessing other endpoints",
        )

    return {"token": payload, "officer": officer}


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        return False
