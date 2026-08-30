from __future__ import annotations

import asyncio
from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.routers import case_diary
from app.services.db import fetch_scalar
from app.services.job_store import DatabaseJobStore


def _officer() -> dict:
    return {"id": "officer-1", "role": "INSPECTOR", "stationId": "station-1"}


def _upload(filename: str, content_type: str, content: bytes) -> UploadFile:
    return UploadFile(
        file=BytesIO(content),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def test_database_job_store_survives_a_new_store_instance(db_available: bool) -> None:
    if not db_available or not DatabaseJobStore.storage_ready():
        pytest.skip("durable FIR job migration is not available")

    officer_id = fetch_scalar('SELECT id FROM "Officer" ORDER BY id LIMIT 1')
    if not officer_id:
        pytest.skip("test database has no officer")

    first_process = DatabaseJobStore()
    job = first_process.create(
        str(officer_id),
        "restart-safe.pdf",
        document_content=b"%PDF-private",
        document_content_type="application/pdf",
    )
    try:
        first_process.set_stage(job.id, "Extracting")
        first_process.finish(job.id, {"rawText": "safe extracted text"})

        second_process = DatabaseJobStore()
        restored = second_process.get(job.id, str(officer_id))
        assert restored is not None
        assert restored.status == "done"
        assert restored.result == {"rawText": "safe extracted text"}
        assert [item.id for item in second_process.list_for(str(officer_id))].count(job.id) == 1
        document = second_process.get_document(job.id, str(officer_id))
        assert document is not None
        assert bytes(document["content"]) == b"%PDF-private"
        assert second_process.get(job.id, "another-officer") is None
    finally:
        first_process.discard(job.id, str(officer_id))


def test_diary_upload_stores_private_bytes_in_database(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}
    monkeypatch.setattr(case_diary, "require_case_write", lambda _officer: None)
    monkeypatch.setattr(case_diary, "get_case_with_relations", lambda *_args: {"id": "case-1"})
    monkeypatch.setattr(case_diary, "_durable_document_storage_ready", lambda: True)
    monkeypatch.setattr(case_diary, "new_id", lambda: "document-1")
    monkeypatch.setattr(
        case_diary,
        "execute",
        lambda sql, params: captured.update(sql=sql, params=params),
    )
    monkeypatch.setattr(case_diary, "create_audit_log", lambda *_args: None)

    response = asyncio.run(
        case_diary.upload_document(
            "case-1",
            _upload("../unsafe-name.pdf", "application/pdf", b"%PDF-private"),
            current_user={"officer": _officer()},
        )
    )

    assert response == {"success": True, "documentId": "document-1", "name": "unsafe-name.pdf"}
    assert captured["params"]["document_data"] == b"%PDF-private"
    assert captured["params"]["content_type"] == "application/pdf"
    assert captured["params"]["size_bytes"] == len(b"%PDF-private")
    assert "NULL" in captured["sql"]


def test_diary_upload_rejects_unsupported_content_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(case_diary, "require_case_write", lambda _officer: None)
    monkeypatch.setattr(case_diary, "get_case_with_relations", lambda *_args: {"id": "case-1"})
    monkeypatch.setattr(case_diary, "_durable_document_storage_ready", lambda: True)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            case_diary.upload_document(
                "case-1",
                _upload("payload.html", "text/html", b"<script>bad()</script>"),
                current_user={"officer": _officer()},
            )
        )

    assert exc.value.status_code == 415


def test_diary_document_content_is_private_and_audited(monkeypatch: pytest.MonkeyPatch) -> None:
    audit: dict = {}
    monkeypatch.setattr(case_diary, "get_case_with_relations", lambda *_args: {"id": "case-1"})
    monkeypatch.setattr(
        case_diary,
        "fetch_one",
        lambda *_args, **_kwargs: {
            "id": "document-1",
            "name": "diary.pdf",
            "path": None,
            "contentType": "application/pdf",
            "documentData": b"%PDF-private",
        },
    )
    monkeypatch.setattr(
        case_diary,
        "create_audit_log",
        lambda officer_id, action, target_type, target_id, details: audit.update(
            officer_id=officer_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
        ),
    )

    response = case_diary.get_document_content(
        "case-1",
        "document-1",
        download=True,
        current_user={"officer": _officer()},
    )

    assert response.headers["cache-control"] == "private, no-store, max-age=0"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-disposition"].startswith("attachment;")
    assert audit["action"] == "DOWNLOAD_DIARY_DOCUMENT"
    assert audit["target_id"] == "case-1"


def test_linked_diary_document_cannot_be_deleted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(case_diary, "require_case_write", lambda _officer: None)
    monkeypatch.setattr(case_diary, "get_case_with_relations", lambda *_args: {"id": "case-1"})
    monkeypatch.setattr(
        case_diary,
        "fetch_one",
        lambda *_args, **_kwargs: {
            "id": "document-1",
            "path": None,
            "diaryEntryId": "entry-1",
            "evidenceId": None,
        },
    )

    with pytest.raises(HTTPException) as exc:
        case_diary.delete_unlinked_document(
            "case-1",
            "document-1",
            current_user={"officer": _officer()},
        )

    assert exc.value.status_code == 409
