from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import io
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

from app.deps import get_current_user
from app.services.case_access import require_case_write, get_case_with_relations, create_audit_log
from app.services.db import execute, execute_returning, fetch_all, fetch_one, new_id, fetch_scalar

router = APIRouter(prefix="/api/cases/{case_id}/diary", tags=["case_diary"])


class DiaryEntryRequest(BaseModel):
    activityType: str
    narrative: str
    linkedEvidenceIds: list[str] = Field(default_factory=list)
    linkedPersonIds: list[str] = Field(default_factory=list)
    documentIds: list[str] = Field(default_factory=list)
    timestamp: datetime | None = None


class IOUpdateRequest(BaseModel):
    newIoId: str

# Config for uploads
UPLOAD_DIR = "uploads/documents"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("")
def list_diary_entries(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    try:
        officer = current_user["officer"]
        case = get_case_with_relations(case_id, officer)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found or access denied")

        entries = fetch_all(
            '''
            SELECT
                de.id, de."pageNumber", de."authorId", de."activityType", de.narrative, de.timestamp, de."updatedAt",
                o.name AS author_name, o."badgeId" AS author_badge,
                (SELECT json_agg(json_build_object('id', e.id, 'type', e.type, 'description', e.description))
                 FROM "DiaryEntryEvidence" dee
                 JOIN "Evidence" e ON dee."evidenceId" = e.id
                 WHERE dee."diaryEntryId" = de.id) AS evidence,
                (SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'role', p.role))
                 FROM "DiaryEntryPerson" dep
                 JOIN "Person" p ON dep."personId" = p.id
                 WHERE dep."diaryEntryId" = de.id) AS persons,
                (SELECT json_agg(json_build_object('id', d.id, 'name', d.name, 'path', d.path))
                 FROM "Document" d
                 WHERE d."diaryEntryId" = de.id) AS documents
            FROM "CaseDiaryEntry" de
            JOIN "Officer" o ON de."authorId" = o.id
            WHERE de."caseId" = %(case_id)s
            ORDER BY de.timestamp ASC, de."pageNumber" ASC
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
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


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
    now = payload.timestamp if payload.timestamp else datetime.now(timezone.utc)
    created_at = datetime.now(timezone.utc)

    # Get max page number for this case on this specific date
    max_page = fetch_scalar(
        '''
        SELECT COALESCE(MAX("pageNumber"), 0) 
        FROM "CaseDiaryEntry" 
        WHERE "caseId" = %(case_id)s 
          AND CAST(timestamp AS DATE) = CAST(%(now)s AS DATE)
        ''',
        {"case_id": case_id, "now": now}
    )
    new_page = (max_page or 0) + 1

    execute(
        '''
        INSERT INTO "CaseDiaryEntry" (id, "caseId", "pageNumber", "authorId", "activityType", narrative, timestamp, "updatedAt")
        VALUES (%(id)s, %(case_id)s, %(page_number)s, %(author_id)s, %(activity_type)s, %(narrative)s, %(now)s, %(created_at)s)
        ''',
        {
            "id": entry_id,
            "case_id": case_id,
            "page_number": new_page,
            "author_id": officer["id"],
            "activity_type": payload.activityType,
            "narrative": payload.narrative,
            "now": now,
            "created_at": created_at
        }
    )

    # Link Evidence
    for ev_id in payload.linkedEvidenceIds:
        execute(
            'INSERT INTO "DiaryEntryEvidence" ("diaryEntryId", "evidenceId") VALUES (%(diary_id)s, %(ev_id)s) ON CONFLICT DO NOTHING',
            {"diary_id": entry_id, "ev_id": ev_id}
        )

    # Link Persons
    for person_id in payload.linkedPersonIds:
        execute(
            'INSERT INTO "DiaryEntryPerson" ("diaryEntryId", "personId") VALUES (%(diary_id)s, %(person_id)s) ON CONFLICT DO NOTHING',
            {"diary_id": entry_id, "person_id": person_id}
        )

    # Link Documents
    for doc_id in payload.documentIds:
        execute(
            'UPDATE "Document" SET "diaryEntryId" = %(diary_id)s WHERE id = %(doc_id)s',
            {"diary_id": entry_id, "doc_id": doc_id}
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

    doc_id = new_id()
    # Save the file locally
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ""
    local_path = os.path.join(UPLOAD_DIR, f"{doc_id}{file_extension}")
    
    with open(local_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Insert into database
    execute(
        '''
        INSERT INTO "Document" (id, "caseId", name, path, "createdAt")
        VALUES (%(id)s, %(case_id)s, %(name)s, %(path)s, %(now)s)
        ''',
        {
            "id": doc_id,
            "case_id": case_id,
            "name": file.filename or "Unnamed Document",
            "path": local_path,
            "now": datetime.now(timezone.utc)
        }
    )
    
    create_audit_log(officer["id"], "UPLOAD_DOCUMENT", "CASE", case_id, f"Uploaded document: {file.filename}")

    return {"success": True, "documentId": doc_id, "name": file.filename, "path": local_path}


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

    now = payload.timestamp if payload.timestamp else datetime.now(timezone.utc)
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

    if payload.documentIds:
        for doc_id in payload.documentIds:
            execute(
                'UPDATE "Document" SET "diaryEntryId" = %(diary_id)s WHERE id = %(doc_id)s',
                {"diary_id": entry_id, "doc_id": doc_id}
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

    execute('DELETE FROM "CaseDiaryEntry" WHERE id = %(id)s', {"id": entry_id})

    create_audit_log(officer["id"], "DELETE_DIARY_ENTRY", "CASE", case_id, f"Deleted diary entry pg {entry['pageNumber']}")

    return {"success": True}

from typing import Optional

@router.get("/export")
def export_case_diary_pdf(
    case_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if not HAS_REPORTLAB:
        raise HTTPException(status_code=500, detail="PDF generation library is not installed.")

    officer = current_user["officer"]
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    query = '''
        SELECT
            de.id, de."pageNumber", de."authorId", de."activityType", de.narrative, de.timestamp, de."updatedAt",
            o.name AS author_name, o."badgeId" AS author_badge
        FROM "CaseDiaryEntry" de
        JOIN "Officer" o ON de."authorId" = o.id
        WHERE de."caseId" = %(case_id)s
    '''
    params = {"case_id": case_id}

    if start_date:
        query += " AND CAST(de.timestamp AS DATE) >= CAST(%(start_date)s AS DATE)"
        params["start_date"] = start_date
    if end_date:
        query += " AND CAST(de.timestamp AS DATE) <= CAST(%(end_date)s AS DATE)"
        params["end_date"] = end_date

    query += ' ORDER BY de.timestamp ASC, de."pageNumber" ASC'
    
    entries = fetch_all(query, params)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=18)
    
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='Center', alignment=TA_CENTER))
    
    elements = []
    
    elements.append(Paragraph(f"Case Diary - {case['title']}", styles['Title']))
    elements.append(Paragraph(f"FIR Number: {case['firNumber']}", styles['Center']))
    elements.append(Spacer(1, 24))

    # Group entries by date
    current_date_str = None
    
    for entry in entries:
        dt = entry["timestamp"]
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        
        # Localize or format date
        date_str = dt.strftime("%B %d, %Y")
        
        if date_str != current_date_str:
            elements.append(Spacer(1, 12))
            elements.append(Paragraph(date_str, styles['Heading2']))
            current_date_str = date_str
            
        time_str = dt.strftime("%H:%M")
        header_text = f"<b>{time_str}</b> - Page {entry['pageNumber']} - <i>{entry['activityType']}</i> by {entry['author_name']} ({entry['author_badge']})"
        elements.append(Paragraph(header_text, styles['Normal']))
        elements.append(Spacer(1, 6))
        
        # Split narrative into paragraphs
        paragraphs = entry["narrative"].split('\n')
        for p in paragraphs:
            if p.strip():
                elements.append(Paragraph(p.strip(), styles['Normal']))
        
        elements.append(Spacer(1, 12))

    doc.build(elements)
    
    buffer.seek(0)
    
    return StreamingResponse(
        buffer, 
        media_type="application/pdf", 
        headers={"Content-Disposition": f"attachment; filename=CaseDiary_{case_id}.pdf"}
    )
