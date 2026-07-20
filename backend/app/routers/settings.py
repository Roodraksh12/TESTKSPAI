from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services import audit as audit_service
from app.services.case_access import officer_user_payload

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/audit")
def audit(current_user: dict = Depends(get_current_user)) -> dict:
    # Back-compat alias for GET /api/audit — same RBAC-scoped list (CONSTABLE
    # sees own actions, INSPECTOR sees the station, SP sees everything).
    return {"auditLogs": audit_service.list_audit_logs(current_user["officer"])}


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
