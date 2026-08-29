from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.deps import get_current_user
from app.services.case_access import create_audit_log, jurisdiction_filter_sql
from app.services.db import fetch_one, fetch_scalar

router = APIRouter(prefix="/api/cases/{case_id}/fir-document", tags=["case-fir-document"])


def _storage_ready() -> bool:
    return bool(fetch_scalar("SELECT to_regclass('public.\"CaseFirDocument\"')"))


def _require_visible_case(case_id: str, officer: dict) -> dict:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    case_data = fetch_one(
        f'''
        SELECT c.id, c."rawExtractedText"
        FROM "Case" c
        WHERE c.id = %(caseId)s{scope_sql}
        ''',
        {"caseId": case_id, **scope_params},
    )
    if not case_data:
        raise HTTPException(status_code=404, detail="Case not found")
    return case_data


def _content_disposition(filename: str, *, download: bool) -> str:
    safe_ascii = "".join(
        char if char.isascii() and (char.isalnum() or char in "._- ") else "_"
        for char in filename
    ).strip() or "source-fir"
    safe_ascii = safe_ascii.replace('"', "_")[:180]
    disposition = "attachment" if download else "inline"
    return f"{disposition}; filename=\"{safe_ascii}\"; filename*=UTF-8''{quote(filename, safe='')}"


@router.get("")
def get_fir_document_metadata(
    case_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = current_user["officer"]
    case_data = _require_visible_case(case_id, officer)
    if not _storage_ready():
        return {
            "storageReady": False,
            "document": None,
            "hasExtractedText": bool(case_data.get("rawExtractedText")),
        }

    document = fetch_one(
        '''
        SELECT d.id, d.filename, d."contentType", d."sizeBytes", d.sha256,
               d."uploadedAt", o.name AS "uploadedByName", o."badgeId" AS "uploadedByBadge"
        FROM "CaseFirDocument" d
        JOIN "Officer" o ON o.id = d."uploadedById"
        WHERE d."caseId" = %(caseId)s
        ''',
        {"caseId": case_id},
    )
    return {
        "storageReady": True,
        "document": document,
        "hasExtractedText": bool(case_data.get("rawExtractedText")),
    }


@router.get("/content")
def get_fir_document_content(
    case_id: str,
    download: bool = Query(default=False),
    current_user: dict = Depends(get_current_user),
) -> Response:
    officer = current_user["officer"]
    _require_visible_case(case_id, officer)
    if not _storage_ready():
        raise HTTPException(
            status_code=503,
            detail="FIR document storage is not set up. Apply database migration 0016_case_fir_documents.sql first.",
        )

    document = fetch_one(
        '''
        SELECT id, filename, "contentType", "sizeBytes", sha256, "documentData"
        FROM "CaseFirDocument"
        WHERE "caseId" = %(caseId)s
        ''',
        {"caseId": case_id},
    )
    if not document:
        raise HTTPException(status_code=404, detail="Original FIR document is not available for this case")

    content = document["documentData"]
    if isinstance(content, memoryview):
        content = content.tobytes()

    action = "DOWNLOAD_FIR_DOCUMENT" if download else "VIEW_FIR_DOCUMENT"
    create_audit_log(
        officer["id"],
        action,
        "CASE",
        case_id,
        "Accessed protected original FIR document",
    )
    return Response(
        content=content,
        media_type=document["contentType"],
        headers={
            "Cache-Control": "private, no-store, max-age=0",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": _content_disposition(document["filename"], download=download),
            "X-Content-SHA256": document["sha256"],
        },
    )
