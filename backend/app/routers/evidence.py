from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form

from app.deps import get_current_user
from app.services.case_access import require_case_write, get_case_with_relations, create_audit_log
from app.services.db import execute, fetch_all, new_id

router = APIRouter(prefix="/api/cases/{case_id}/evidence", tags=["evidence"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "evidence"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_EVIDENCE_FILES = 5
MAX_EVIDENCE_FILE_BYTES = 20 * 1024 * 1024

@router.get("")
def list_evidence(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")

    evidence_list = fetch_all(
        '''
        SELECT
            e.id, e.type, e.description, e.status, e.timestamp,
            o.name AS added_by_name, o."badgeId" AS added_by_badge,
            (SELECT json_agg(json_build_object('id', d.id, 'name', d.name, 'path', d.path))
             FROM "Document" d
             WHERE d."evidenceId" = e.id) AS documents,
            (SELECT json_agg(json_build_object('id', de.id, 'activityType', de."activityType", 'pageNumber', de."pageNumber"))
             FROM "DiaryEntryEvidence" dee
             JOIN "CaseDiaryEntry" de ON dee."diaryEntryId" = de.id
             WHERE dee."evidenceId" = e.id) AS diary_entries
        FROM "Evidence" e
        JOIN "Officer" o ON e."addedById" = o.id
        WHERE e."caseId" = %(case_id)s
        ORDER BY e.timestamp DESC
        ''',
        {"case_id": case_id}
    )

    for ev in evidence_list:
        ev["documents"] = ev.get("documents") or []
        ev["diary_entries"] = ev.get("diary_entries") or []

    return {"success": True, "evidence": evidence_list}


@router.post("")
async def add_evidence(
    case_id: str,
    type: str = Form(...),
    description: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    current_user: dict = Depends(get_current_user)
) -> dict:
    officer = current_user["officer"]
    require_case_write(officer)
    case = get_case_with_relations(case_id, officer)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found or access denied")
        
    if case.get("currentIoId") and case["currentIoId"] != officer["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned Investigating Officer can add evidence.")

    valid_types = {"PHOTO", "VIDEO", "VOICE", "FORENSIC", "MISC"}
    if type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid evidence type. Must be one of: {', '.join(valid_types)}")

    if len(files) > MAX_EVIDENCE_FILES:
        raise HTTPException(status_code=413, detail="Attach at most 5 evidence files at once.")

    prepared_files: list[tuple[str, str, bytes]] = []
    for file in files:
        if not file.filename:
            continue
        content = await file.read(MAX_EVIDENCE_FILE_BYTES + 1)
        if len(content) > MAX_EVIDENCE_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Evidence file '{Path(file.filename).name}' exceeds 20 MB.",
            )
        if not content:
            raise HTTPException(
                status_code=400,
                detail=f"Evidence file '{Path(file.filename).name}' is empty.",
            )
        safe_name = Path(file.filename).name
        prepared_files.append((safe_name, Path(safe_name).suffix[:16], content))

    ev_id = new_id()
    now = datetime.now(timezone.utc)

    execute(
        '''
        INSERT INTO "Evidence" (id, "caseId", type, description, "addedById", timestamp)
        VALUES (%(id)s, %(case_id)s, %(type)s, %(desc)s, %(added_by)s, %(now)s)
        ''',
        {
            "id": ev_id,
            "case_id": case_id,
            "type": type,
            "desc": description,
            "added_by": officer["id"],
            "now": now
        }
    )

    document_records = []
    if prepared_files:
        for safe_name, file_extension, content in prepared_files:
            doc_id = new_id()
            local_path = UPLOAD_DIR / f"{doc_id}{file_extension}"
            local_path.write_bytes(content)

            execute(
                '''
                INSERT INTO "Document" (id, "caseId", name, path, "createdAt", "evidenceId")
                VALUES (%(id)s, %(case_id)s, %(name)s, %(path)s, %(now)s, %(evidence_id)s)
                ''',
                {
                    "id": doc_id,
                    "case_id": case_id,
                    "name": safe_name,
                    "path": str(local_path),
                    "now": now,
                    "evidence_id": ev_id
                }
            )
            document_records.append({"id": doc_id, "name": safe_name})

    create_audit_log(officer["id"], "ADD_EVIDENCE", "CASE", case_id, f"Added {type} evidence")

    return {
        "success": True, 
        "evidenceId": ev_id, 
        "documents": document_records
    }
