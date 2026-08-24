from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services import final_report_pdf, final_reports
from app.services.case_access import create_audit_log, require_case_write

router = APIRouter(prefix="/api/cases", tags=["final-reports"])


class FinalReportSaveRequest(BaseModel):
    expectedRevision: int = Field(ge=1)
    payload: dict


class FinalReportReturnRequest(BaseModel):
    note: str = Field(min_length=2, max_length=4_000)


class FinalReportRefreshRequest(BaseModel):
    expectedRevision: int = Field(ge=1)


def _officer(current_user: dict) -> dict:
    return current_user["officer"]


@router.get("/{case_id}/final-report")
def get_final_report(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    return final_reports.get_report(case_id, _officer(current_user))


@router.post("/{case_id}/final-report/initialize")
def initialize_final_report(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = _officer(current_user)
    require_case_write(officer)
    result = final_reports.initialize_report(case_id, officer)
    report = result.get("report")
    if not report:
        raise HTTPException(status_code=500, detail="The final-report draft could not be initialized")
    create_audit_log(
        officer["id"],
        "INITIALIZE_FINAL_REPORT",
        "FINAL_REPORT",
        report["id"],
        f'Initialized deterministic {report["formatVersion"]} draft for case {case_id}',
    )
    return result


@router.put("/{case_id}/final-report")
def save_final_report(
    case_id: str,
    payload: FinalReportSaveRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = _officer(current_user)
    require_case_write(officer)
    result = final_reports.save_report(
        case_id,
        officer,
        payload=payload.payload,
        expected_revision=payload.expectedRevision,
    )
    report = result["report"]
    create_audit_log(
        officer["id"],
        "SAVE_FINAL_REPORT",
        "FINAL_REPORT",
        report["id"],
        f'Saved version {report["versionNumber"]}; blocking errors={report["validation"]["counts"]["errors"]}',
    )
    return result


@router.post("/{case_id}/final-report/submit-review")
def submit_final_report(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = _officer(current_user)
    require_case_write(officer)
    result = final_reports.submit_for_review(case_id, officer)
    report = result["report"]
    create_audit_log(
        officer["id"],
        "SUBMIT_FINAL_REPORT_REVIEW",
        "FINAL_REPORT",
        report["id"],
        f'Submitted version {report["versionNumber"]} for supervisory review',
    )
    return result


@router.post("/{case_id}/final-report/refresh-sources")
def refresh_final_report_sources(
    case_id: str,
    payload: FinalReportRefreshRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = _officer(current_user)
    require_case_write(officer)
    result = final_reports.refresh_report_sources(
        case_id,
        officer,
        expected_revision=payload.expectedRevision,
    )
    report = result["report"]
    create_audit_log(
        officer["id"],
        "REFRESH_FINAL_REPORT_SOURCES",
        "FINAL_REPORT",
        report["id"],
        f'Refreshed case data into report version {report["versionNumber"]}',
    )
    return result


@router.post("/{case_id}/final-report/return")
def return_final_report(
    case_id: str,
    payload: FinalReportReturnRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = _officer(current_user)
    require_case_write(officer)
    result = final_reports.return_for_correction(case_id, officer, payload.note)
    report = result["report"]
    create_audit_log(
        officer["id"],
        "RETURN_FINAL_REPORT",
        "FINAL_REPORT",
        report["id"],
        "Returned report to the IO for correction",
    )
    return result


@router.post("/{case_id}/final-report/approve")
def approve_final_report(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = _officer(current_user)
    require_case_write(officer)
    result = final_reports.approve_report(case_id, officer)
    report = result["report"]
    create_audit_log(
        officer["id"],
        "APPROVE_FINAL_REPORT",
        "FINAL_REPORT",
        report["id"],
        f'Approved report version {report["versionNumber"]}',
    )
    return result


@router.get("/{case_id}/final-report/versions")
def list_final_report_versions(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    return {"versions": final_reports.list_versions(case_id, _officer(current_user))}


@router.get("/{case_id}/final-report/pdf")
def export_final_report_pdf(case_id: str, current_user: dict = Depends(get_current_user)) -> StreamingResponse:
    officer = _officer(current_user)
    result = final_reports.get_report(case_id, officer, upgrade_editable=False)
    report = result.get("report")
    if not report:
        raise HTTPException(status_code=404, detail="Final report not found")
    pdf = final_report_pdf.build_final_report_pdf(report)
    safe_fir = "".join(character if character.isalnum() else "_" for character in report["payload"]["caseDetails"]["firNumber"])
    filename = f"Final_Report_{safe_fir}_v{report['versionNumber']}.pdf"
    create_audit_log(
        officer["id"],
        "EXPORT_FINAL_REPORT_PDF",
        "FINAL_REPORT",
        report["id"],
        f'Exported version {report["versionNumber"]} with status {report["status"]}',
    )
    return StreamingResponse(
        iter([pdf]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
