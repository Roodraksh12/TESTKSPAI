from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services import report_sources
from app.services.case_access import create_audit_log, require_case_write


router = APIRouter(prefix="/api/cases", tags=["report-sources"])


class ReportSourcesSaveRequest(BaseModel):
    expectedRevision: int = Field(ge=0)
    payload: dict


def _officer(current_user: dict) -> dict:
    return current_user["officer"]


@router.get("/{case_id}/report-sources")
def get_case_report_sources(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    return report_sources.load_report_sources(case_id, _officer(current_user))


@router.put("/{case_id}/report-sources")
def save_case_report_sources(
    case_id: str,
    request: ReportSourcesSaveRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = _officer(current_user)
    require_case_write(officer)
    result = report_sources.save_report_sources(
        case_id,
        officer,
        expected_revision=request.expectedRevision,
        payload=request.payload,
    )
    create_audit_log(
        officer["id"],
        "SAVE_CASE_REPORT_SOURCES",
        "CASE",
        case_id,
        f'Saved report-source revision {result["revision"]}; contradictions={result["validation"]["counts"]["errors"]}',
    )
    return result
