from __future__ import annotations

import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers import case_fir_documents, cases
from app.services.job_store import JobStore


def test_job_api_never_serializes_original_document() -> None:
    store = JobStore()
    job = store.create(
        "officer-1",
        "fir.pdf",
        document_content=b"%PDF-private",
        document_content_type="application/pdf",
    )
    store.finish(job.id, {"rawText": "safe extracted text"})

    serialized = json.dumps(job.as_dict())
    assert "%PDF-private" not in serialized
    assert "document_content" not in serialized
    assert store.get_document(job.id, "officer-2") is None
    assert store.get_document(job.id, "officer-1") == {
        "filename": "fir.pdf",
        "contentType": "application/pdf",
        "content": b"%PDF-private",
    }


def test_fir_content_requires_case_visibility(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(case_fir_documents, "fetch_one", lambda *_args, **_kwargs: None)

    with pytest.raises(HTTPException) as exc:
        case_fir_documents.get_fir_document_content(
            "outside-scope",
            current_user={"officer": {"id": "officer-1"}},
        )

    assert exc.value.status_code == 404


def test_fir_content_is_private_and_audited(monkeypatch: pytest.MonkeyPatch) -> None:
    audit: dict = {}
    monkeypatch.setattr(case_fir_documents, "_storage_ready", lambda: True)
    rows = iter(
        [
            {"id": "case-1", "rawExtractedText": "text"},
            {
                "id": "document-1",
                "filename": "ಮಾಹಿತಿ fir.pdf",
                "contentType": "application/pdf",
                "sizeBytes": 12,
                "sha256": "a" * 64,
                "documentData": b"%PDF-private",
            },
        ]
    )
    monkeypatch.setattr(
        case_fir_documents,
        "fetch_one",
        lambda *_args, **_kwargs: next(rows),
    )
    monkeypatch.setattr(
        case_fir_documents,
        "create_audit_log",
        lambda officer_id, action, target_type, target_id, details: audit.update(
            officer_id=officer_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
        ),
    )

    response = case_fir_documents.get_fir_document_content(
        "case-1",
        download=True,
        current_user={"officer": {"id": "officer-1"}},
    )

    assert response.body == b"%PDF-private"
    assert response.headers["cache-control"] == "private, no-store, max-age=0"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-disposition"].startswith("attachment;")
    assert "UTF-8''" in response.headers["content-disposition"]
    assert audit["action"] == "DOWNLOAD_FIR_DOCUMENT"
    assert audit["target_id"] == "case-1"


def test_fir_document_endpoints_require_authentication() -> None:
    client = TestClient(app)
    assert client.get("/api/cases/case-1/fir-document").status_code in (401, 403)
    assert client.get("/api/cases/case-1/fir-document/content").status_code in (401, 403)


def test_case_creation_associates_only_the_confirmed_job_document(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}
    source = {
        "filename": "source.pdf",
        "contentType": "application/pdf",
        "content": b"%PDF-source",
    }

    class DoneJob:
        status = "done"

    class FakeJobs:
        def get(self, job_id, officer_id):
            return DoneJob() if (job_id, officer_id) == ("job-1", "officer-1") else None

        def get_document(self, job_id, officer_id):
            return source if (job_id, officer_id) == ("job-1", "officer-1") else None

    monkeypatch.setattr(cases, "fir_jobs", FakeJobs())
    monkeypatch.setattr(cases, "require_case_write", lambda _officer: None)
    monkeypatch.setattr(cases, "_fir_document_storage_ready", lambda: True)
    monkeypatch.setattr(cases, "_allocate_fir_number", lambda _year: "FIR/2026/0001")
    monkeypatch.setattr(cases.geocoder, "geocode_location", lambda *_args: (None, None))

    def fake_insert(case_params, document, officer_id):
        captured.update(case_params=case_params, document=document, officer_id=officer_id)
        return {"id": "case-new"}

    monkeypatch.setattr(cases, "_insert_case_with_optional_document", fake_insert)
    monkeypatch.setattr(cases.intake_intel, "persist_intake_matches", lambda **_kwargs: None)
    monkeypatch.setattr(cases.intake_intel, "build_case_intake_brief", lambda *_args: {"error": "none"})
    monkeypatch.setattr(cases, "create_audit_log", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(cases, "invalidate_all", lambda: None)
    monkeypatch.setattr(cases, "refresh_hotspot_warnings", lambda **_kwargs: None)

    response = cases.create_case(
        cases.CreateCaseRequest(
            crimeType="Burglary",
            narrativeSummary="Synthetic test",
            firJobId="job-1",
        ),
        current_user={
            "officer": {
                "id": "officer-1",
                "role": "INSPECTOR",
                "stationId": "station-1",
                "stationName": "Test Station",
            }
        },
    )

    assert response["caseId"] == "case-new"
    assert captured["document"] is source
    assert captured["officer_id"] == "officer-1"


def test_case_creation_cannot_reuse_another_officers_job(monkeypatch: pytest.MonkeyPatch) -> None:
    class OtherOfficersJobs:
        def get(self, _job_id, _officer_id):
            return None

    monkeypatch.setattr(cases, "fir_jobs", OtherOfficersJobs())
    monkeypatch.setattr(cases, "require_case_write", lambda _officer: None)

    with pytest.raises(HTTPException) as exc:
        cases.create_case(
            cases.CreateCaseRequest(firJobId="another-officers-job"),
            current_user={
                "officer": {
                    "id": "officer-1",
                    "role": "INSPECTOR",
                    "stationId": "station-1",
                }
            },
        )

    assert exc.value.status_code == 404


def test_legacy_case_has_safe_document_fallback(db_available: bool) -> None:
    if not db_available:
        pytest.skip("local Postgres not reachable")

    client = TestClient(app)
    login = client.post(
        "/api/auth/login",
        json={"badgeId": "KA-SP-9999", "password": "demo1234"},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f'Bearer {login.json()["token"]}'}
    cases = client.get("/api/cases", params={"limit": 1}, headers=headers)
    assert cases.status_code == 200, cases.text
    case_id = cases.json()["cases"][0]["id"]

    response = client.get(f"/api/cases/{case_id}/fir-document", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["storageReady"] is True
    assert "document" in payload
    assert "hasExtractedText" in payload
