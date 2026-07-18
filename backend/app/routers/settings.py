from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services.case_access import officer_user_payload
from app.services.db import fetch_all

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/audit")
def audit(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    audit_logs = fetch_all(
        '''
        SELECT * FROM "AuditLog"
        WHERE "officerId" = %(officerId)s
        ORDER BY "createdAt" DESC
        LIMIT 100
        ''',
        {"officerId": officer["id"]},
    )
    return {"auditLogs": audit_logs}


@router.get("/jurisdiction")
def jurisdiction(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    return {
        "jurisdiction": {
            "officer": officer_user_payload(officer),
            "districtName": officer.get("districtName"),
            "stationName": officer.get("stationName"),
        }
    }
