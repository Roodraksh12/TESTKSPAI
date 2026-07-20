from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.services.case_access import load_officer_by_id, officer_user_payload

bearer = HTTPBearer(auto_error=True)


def create_access_token(officer: dict[str, Any], settings: Settings) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": officer["id"],
        "badgeId": officer["badgeId"],
        "role": officer["role"],
        "stationId": officer["stationId"],
        "districtId": officer["districtId"],
        "name": officer["name"],
        "iat": now,
        "exp": now + timedelta(days=7),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user(
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

    return {"token": payload, "officer": officer}


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        return False
