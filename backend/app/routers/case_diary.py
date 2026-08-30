from __future__ import annotations

import html
import hashlib
import io
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

from app.deps import get_current_user
from app.services.case_access import (
    create_audit_log,
    get_case_with_relations,
    load_officer_by_id,
    require_case_write,
)
from app.services.db import execute, fetch_all, fetch_one, new_id, fetch_scalar

router = APIRouter(prefix="/api/cases/{case_id}/diary", tags=["case_diary"])
logger = logging.getLogger(__name__)


class DiaryEntryRequest(BaseModel):
    activityType: str
    narrative: str
    linkedEvidenceIds: list[str] = Field(default_factory=list)
    linkedPersonIds: list[str] = Field(default_factory=list)
    documentIds: list[str] = Field(default_factory=list)
    timestamp: datetime | None = None


class IOUpdateRequest(BaseModel):
    newIoId: str

# Resolve from the backend directory so the process working directory cannot
# scatter sensitive uploads elsewhere in the repository.
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "documents"
MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
DIARY_TIMEZONE = ZoneInfo("Asia/Kolkata")
ALLOWED_DOCUMENT_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _as_utc(value: datetime) -> datetime:
    """Normalize client/API values to the UTC instants stored in the database."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _stored_utc_timestamp(value: datetime) -> datetime:
    """Return the UTC wall-clock value for the legacy timestamp-without-TZ column."""
    return _as_utc(value).replace(tzinfo=None)


def _diary_date_for(value: datetime) -> date:
    """Karnataka calendar day for an instant stored as UTC."""
    return _as_utc(value).astimezone(DIARY_TIMEZONE).date()


def _diary_date_sql(column: str) -> str:
    """SQL expression for a UTC timestamp-without-TZ rendered in Karnataka time."""
    return f"(({column} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date"


def _durable_document_storage_ready() -> bool:
    return bool(
        fetch_scalar(
            '''
            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'Document'
                AND column_name = 'documentData'
            )
            ''',
        )
    )


def _reindex_diary_date(case_id: str, diary_date: date) -> None:
    """Keep legacy pageNumber aligned with chronological pages for one diary day."""
    local_date = _diary_date_sql('de.timestamp')
    execute(
        f'''
        WITH numbered AS (
            SELECT de.id,
                   ROW_NUMBER() OVER (ORDER BY de.timestamp ASC, de.id ASC)::int AS page_number
            FROM "CaseDiaryEntry" de
            WHERE de."caseId" = %(case_id)s
              AND {local_date} = %(diary_date)s
        )
        UPDATE "CaseDiaryEntry" de
        SET "pageNumber" = numbered.page_number
        FROM numbered
        WHERE de.id = numbered.id
        ''',
        {"case_id": case_id, "diary_date": diary_date},
    )


@router.get("")
def list_diary_entries(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    try:
        officer = current_user["officer"]
        case = get_case_with_relations(case_id, officer)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found or access denied")

        local_date = _diary_date_sql('de.timestamp')
        entries = fetch_all(
            '''
            SELECT
                de.id, de."pageNumber", de."authorId", de."activityType", de.narrative, de.timestamp, de."updatedAt",
                ''' + local_date + ''' AS "diaryDate",
                ROW_NUMBER() OVER (
                    PARTITION BY ''' + local_date + '''
                    ORDER BY de.timestamp ASC, de.id ASC
                )::int AS "dailyPageNumber",
                o.name AS author_name, o."badgeId" AS author_badge,
                (SELECT json_agg(json_build_object('id', e.id, 'type', e.type, 'description', e.description))
                 FROM "DiaryEntryEvidence" dee
                 JOIN "Evidence" e ON dee."evidenceId" = e.id
                 WHERE dee."diaryEntryId" = de.id) AS evidence,
                (SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'role', p.role))
                 FROM "DiaryEntryPerson" dep
                 JOIN "Person" p ON dep."personId" = p.id
                 WHERE dep."diaryEntryId" = de.id) AS persons,
                (SELECT json_agg(json_build_object('id', d.id, 'name', d.name))
                 FROM "Document" d
                 WHERE d."diaryEntryId" = de.id) AS documents
            FROM "CaseDiaryEntry" de
            JOIN "Officer" o ON de."authorId" = o.id
            WHERE de."caseId" = %(case_id)s
            ORDER BY "diaryDate" DESC, "dailyPageNumber" ASC
            ''',
            {"case_id": case_id}
        )

        current_io = None
        if case.get("currentIoId"):
            io_row = fetch_one('SELECT name, "badgeId" FROM "Officer" WHERE id = %(id)s', {"id": case["currentIoId"]})
            if io_row:
                current_io = io_row

        # Ensure empty lists instead of None for JSON aggregations
        for entry in entries:
            entry["evidence"] = entry.get("evidence") or []
            entry["persons"] = entry.get("persons") or []
            entry["documents"] = entry.get("documents") or []
            
            # Handle string timestamps returned by fetch_all serialization
            if entry.get("timestamp") and isinstance(entry["timestamp"], str):
                if not entry["timestamp"].endswith("Z") and "+" not in entry["timestamp"]:
                    entry["timestamp"] += "Z"
            elif entry.get("timestamp") and isinstance(entry["timestamp"], datetime) and entry["timestamp"].tzinfo is None:
                entry["timestamp"] = entry["timestamp"].replace(tzinfo=timezone.utc).isoformat()
                
            if entry.get("updatedAt") and isinstance(entry["updatedAt"], str):
                if not entry["updatedAt"].endswith("Z") and "+" not in entry["updatedAt"]:
                    entry["updatedAt"] += "Z"
            elif entry.get("updatedAt") and isinstance(entry["updatedAt"], datetime) and entry["updatedAt"].tzinfo is None:
                entry["updatedAt"] = entry["updatedAt"].replace(tzinfo=timezone.utc).isoformat()

        return {
            "success": True,
            "currentIo": current_io,
            "entries": entries
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to load case diary", exc_info=exc)
        raise HTTPException(status_code=500, detail="Failed to load case diary") from exc


@router.post("")
def add_diary_entry(
    case_id: str,
    payload: DiaryEntryRequest,
    current_user: dict = Depends(get_current_user)
) -> dict:
    officer = current_user["officer"]
    require_case_write(officer)
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")
    
    if case.get("currentIoId") and case["currentIoId"] != officer["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned Investigating Officer can add diary entries.")

    entry_id = new_id()
    now = _stored_utc_timestamp(payload.timestamp or datetime.now(timezone.utc))
    created_at = datetime.now(timezone.utc)
    diary_date = _diary_date_for(now)

    execute(
        '''
        INSERT INTO "CaseDiaryEntry" (id, "caseId", "pageNumber", "authorId", "activityType", narrative, timestamp, "updatedAt")
        VALUES (%(id)s, %(case_id)s, %(page_number)s, %(author_id)s, %(activity_type)s, %(narrative)s, %(now)s, %(created_at)s)
        ''',
        {
            "id": entry_id,
            "case_id": case_id,
            "page_number": 0,
            "author_id": officer["id"],
            "activity_type": payload.activityType,
            "narrative": payload.narrative,
            "now": now,
            "created_at": created_at
        }
    )

    _reindex_diary_date(case_id, diary_date)
    new_page = fetch_scalar(
        'SELECT "pageNumber" FROM "CaseDiaryEntry" WHERE id = %(id)s',
        {"id": entry_id},
    )

    # Link Evidence
    for ev_id in payload.linkedEvidenceIds:
        execute(
            '''
            INSERT INTO "DiaryEntryEvidence" ("diaryEntryId", "evidenceId")
            SELECT %(diary_id)s, e.id FROM "Evidence" e
            WHERE e.id = %(ev_id)s AND e."caseId" = %(case_id)s
            ON CONFLICT DO NOTHING
            ''',
            {"diary_id": entry_id, "ev_id": ev_id, "case_id": case_id}
        )

    # Link Persons
    for person_id in payload.linkedPersonIds:
        execute(
            '''
            INSERT INTO "DiaryEntryPerson" ("diaryEntryId", "personId")
            SELECT %(diary_id)s, cp."personId" FROM "CasePerson" cp
            WHERE cp."personId" = %(person_id)s AND cp."caseId" = %(case_id)s
            ON CONFLICT DO NOTHING
            ''',
            {"diary_id": entry_id, "person_id": person_id, "case_id": case_id}
        )

    # Link Documents
    for doc_id in payload.documentIds:
        execute(
            'UPDATE "Document" SET "diaryEntryId" = %(diary_id)s WHERE id = %(doc_id)s AND "caseId" = %(case_id)s',
            {"diary_id": entry_id, "doc_id": doc_id, "case_id": case_id}
        )

    create_audit_log(officer["id"], "ADD_DIARY_ENTRY", "CASE", case_id, f"Added diary entry pg {new_page}")

    return {"success": True, "entryId": entry_id}

@router.post("/documents")
async def upload_document(
    case_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
) -> dict:
    officer = current_user["officer"]
    require_case_write(officer)
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    if case.get("currentIoId") and case["currentIoId"] != officer["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned Investigating Officer can upload documents.")

    if not _durable_document_storage_ready():
        raise HTTPException(
            status_code=503,
            detail="Durable diary-document storage is not set up. Apply database migration 0019_durable_upload_storage.sql first.",
        )

    content = await file.read(MAX_DOCUMENT_BYTES + 1)
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="Documents must be 20 MB or smaller.")
    if not content:
        raise HTTPException(status_code=400, detail="Document is empty.")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_DOCUMENT_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Only PDF, JPEG, PNG, DOC, and DOCX documents are supported.",
        )

    doc_id = new_id()
    safe_name = Path(file.filename or "Unnamed Document").name

    execute(
        '''
        INSERT INTO "Document" (
          id, "caseId", name, path, "contentType", "sizeBytes", sha256,
          "documentData", "uploadedById", "createdAt"
        )
        VALUES (
          %(id)s, %(case_id)s, %(name)s, NULL, %(content_type)s, %(size_bytes)s,
          %(sha256)s, %(document_data)s, %(uploaded_by)s, %(now)s
        )
        ''',
        {
            "id": doc_id,
            "case_id": case_id,
            "name": safe_name,
            "content_type": content_type,
            "size_bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
            "document_data": content,
            "uploaded_by": officer["id"],
            "now": datetime.now(timezone.utc)
        }
    )
    
    create_audit_log(officer["id"], "UPLOAD_DOCUMENT", "CASE", case_id, f"Uploaded document: {safe_name}")

    return {"success": True, "documentId": doc_id, "name": safe_name}


@router.get("/documents/{document_id}/content")
def get_document_content(
    case_id: str,
    document_id: str,
    download: bool = False,
    current_user: dict = Depends(get_current_user),
):
    officer = current_user["officer"]
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    document = fetch_one(
        '''
        SELECT id, name, path, "contentType", "documentData"
        FROM "Document"
        WHERE id = %(document_id)s AND "caseId" = %(case_id)s
        ''',
        {"document_id": document_id, "case_id": case_id},
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    content = document.get("documentData")
    if content is None and document.get("path"):
        legacy_path = Path(document["path"]).resolve()
        upload_root = UPLOAD_DIR.resolve()
        if upload_root not in legacy_path.parents or not legacy_path.is_file():
            raise HTTPException(status_code=404, detail="Legacy document file is unavailable")
        content = legacy_path.read_bytes()
    if content is None:
        raise HTTPException(status_code=404, detail="Document content is unavailable")

    disposition = "attachment" if download else "inline"
    encoded_name = quote(document["name"], safe="")
    create_audit_log(
        officer["id"],
        "DOWNLOAD_DIARY_DOCUMENT" if download else "VIEW_DIARY_DOCUMENT",
        "CASE",
        case_id,
        f'{disposition.title()} diary document {document_id}',
    )
    return StreamingResponse(
        io.BytesIO(content),
        media_type=document.get("contentType") or "application/octet-stream",
        headers={
            "Cache-Control": "private, no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{encoded_name}",
        },
    )


@router.delete("/documents/{document_id}")
def delete_unlinked_document(
    case_id: str,
    document_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = current_user["officer"]
    require_case_write(officer)
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")
    if case.get("currentIoId") and case["currentIoId"] != officer["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned Investigating Officer can delete documents.")

    document = fetch_one(
        '''
        SELECT id, path, "diaryEntryId", "evidenceId"
        FROM "Document"
        WHERE id = %(document_id)s AND "caseId" = %(case_id)s
        ''',
        {"document_id": document_id, "case_id": case_id},
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if document.get("diaryEntryId") or document.get("evidenceId"):
        raise HTTPException(status_code=409, detail="A linked document cannot be deleted from the upload draft")

    execute(
        'DELETE FROM "Document" WHERE id = %(document_id)s AND "caseId" = %(case_id)s',
        {"document_id": document_id, "case_id": case_id},
    )
    if document.get("path"):
        legacy_path = Path(document["path"]).resolve()
        if UPLOAD_DIR.resolve() in legacy_path.parents and legacy_path.is_file():
            legacy_path.unlink()
    create_audit_log(officer["id"], "DELETE_UNLINKED_DIARY_DOCUMENT", "CASE", case_id, document_id)
    return {"deleted": True}


@router.put("/io")
def update_current_io(
    case_id: str,
    payload: IOUpdateRequest,
    current_user: dict = Depends(get_current_user)
) -> dict:
    officer = current_user["officer"]
    require_case_write(officer)
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    target = load_officer_by_id(payload.newIoId)
    if (
        not target
        or target.get("status") == "DISABLED"
        or not target.get("stationId")
        or target.get("stationId") != case.get("stationId")
    ):
        raise HTTPException(
            status_code=400,
            detail="Investigating Officer must be an active officer from the case station.",
        )

    execute(
        'UPDATE "Case" SET "currentIoId" = %(new_io)s WHERE id = %(case_id)s',
        {"new_io": payload.newIoId, "case_id": case_id}
    )
    
    create_audit_log(officer["id"], "UPDATE_CASE_IO", "CASE", case_id, f"Reassigned IO to {payload.newIoId}")

    return {"success": True}

@router.put("/{entry_id}")
def update_diary_entry(
    case_id: str,
    entry_id: str,
    payload: DiaryEntryRequest,
    current_user: dict = Depends(get_current_user)
) -> dict:
    officer = current_user["officer"]
    require_case_write(officer)
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    if case.get("currentIoId") and case["currentIoId"] != officer["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned Investigating Officer can edit diary entries.")

    entry = fetch_one('SELECT * FROM "CaseDiaryEntry" WHERE id = %(id)s AND "caseId" = %(case_id)s', {"id": entry_id, "case_id": case_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Diary entry not found")

    old_timestamp = entry["timestamp"]
    now = _stored_utc_timestamp(payload.timestamp or datetime.now(timezone.utc))
    updated_at = datetime.now(timezone.utc)

    execute(
        '''
        UPDATE "CaseDiaryEntry"
        SET "activityType" = %(activity_type)s,
            narrative = %(narrative)s,
            timestamp = %(now)s,
            "updatedAt" = %(updated_at)s
        WHERE id = %(id)s
        ''',
        {
            "id": entry_id,
            "activity_type": payload.activityType,
            "narrative": payload.narrative,
            "now": now,
            "updated_at": updated_at
        }
    )

    _reindex_diary_date(case_id, _diary_date_for(old_timestamp))
    _reindex_diary_date(case_id, _diary_date_for(now))

    if payload.documentIds:
        for doc_id in payload.documentIds:
            execute(
                'UPDATE "Document" SET "diaryEntryId" = %(diary_id)s WHERE id = %(doc_id)s AND "caseId" = %(case_id)s',
                {"diary_id": entry_id, "doc_id": doc_id, "case_id": case_id}
            )

    create_audit_log(officer["id"], "UPDATE_DIARY_ENTRY", "CASE", case_id, f"Updated diary entry pg {entry['pageNumber']}")

    return {"success": True}

@router.delete("/{entry_id}")
def delete_diary_entry(
    case_id: str,
    entry_id: str,
    current_user: dict = Depends(get_current_user)
) -> dict:
    officer = current_user["officer"]
    require_case_write(officer)
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    if case.get("currentIoId") and case["currentIoId"] != officer["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned Investigating Officer can delete diary entries.")

    entry = fetch_one('SELECT * FROM "CaseDiaryEntry" WHERE id = %(id)s AND "caseId" = %(case_id)s', {"id": entry_id, "case_id": case_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Diary entry not found")

    diary_date = _diary_date_for(entry["timestamp"])
    execute('DELETE FROM "CaseDiaryEntry" WHERE id = %(id)s', {"id": entry_id})
    _reindex_diary_date(case_id, diary_date)

    create_audit_log(officer["id"], "DELETE_DIARY_ENTRY", "CASE", case_id, f"Deleted diary entry pg {entry['pageNumber']}")

    return {"success": True}

@router.get("/export")
def export_case_diary_pdf(
    case_id: str,
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: dict = Depends(get_current_user)
):
    if not HAS_REPORTLAB:
        raise HTTPException(status_code=500, detail="PDF generation library is not installed.")

    officer = current_user["officer"]
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be on or before end date.")

    local_date = _diary_date_sql('de.timestamp')
    query = '''
        SELECT
            de.id, de."pageNumber", de."authorId", de."activityType", de.narrative, de.timestamp, de."updatedAt",
            ''' + local_date + ''' AS "diaryDate",
            ROW_NUMBER() OVER (
                PARTITION BY ''' + local_date + '''
                ORDER BY de.timestamp ASC, de.id ASC
            )::int AS "dailyPageNumber",
            o.name AS author_name, o."badgeId" AS author_badge
        FROM "CaseDiaryEntry" de
        JOIN "Officer" o ON de."authorId" = o.id
        WHERE de."caseId" = %(case_id)s
    '''
    params = {"case_id": case_id}

    if start_date:
        query += f" AND {local_date} >= %(start_date)s"
        params["start_date"] = start_date
    if end_date:
        query += f" AND {local_date} <= %(end_date)s"
        params["end_date"] = end_date

    query += ' ORDER BY "diaryDate" ASC, "dailyPageNumber" ASC'
    
    entries = fetch_all(query, params)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=18)
    
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='Center', alignment=TA_CENTER))
    
    elements = []
    
    elements.append(Paragraph(f"Case Diary - {html.escape(str(case['firNumber']))}", styles['Title']))
    elements.append(
        Paragraph(
            f"Crime Type: {html.escape(str(case.get('crimeType') or 'Unknown'))}",
            styles['Center'],
        )
    )
    elements.append(Spacer(1, 24))

    # Group entries by date
    current_diary_date = None
    
    for entry in entries:
        diary_day = entry["diaryDate"]
        if isinstance(diary_day, str):
            diary_day = date.fromisoformat(diary_day)
        date_str = diary_day.strftime("%B %d, %Y")
        if diary_day != current_diary_date:
            elements.append(Spacer(1, 12))
            elements.append(Paragraph(date_str, styles['Heading2']))
            current_diary_date = diary_day

        dt = entry["timestamp"]
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        time_str = _as_utc(dt).astimezone(DIARY_TIMEZONE).strftime("%H:%M")
        header_text = (
            f"<b>{time_str}</b> - Page {entry['dailyPageNumber']} - "
            f"<i>{html.escape(str(entry['activityType']))}</i> by "
            f"{html.escape(str(entry['author_name']))} "
            f"({html.escape(str(entry['author_badge']))})"
        )
        elements.append(Paragraph(header_text, styles['Normal']))
        elements.append(Spacer(1, 6))
        
        # Split narrative into paragraphs
        paragraphs = entry["narrative"].split('\n')
        for p in paragraphs:
            if p.strip():
                elements.append(Paragraph(html.escape(p.strip()), styles['Normal']))
        
        elements.append(Spacer(1, 12))

    doc.build(elements)
    
    buffer.seek(0)
    
    return StreamingResponse(
        buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename=CaseDiary_{case_id}.pdf"}
    )
