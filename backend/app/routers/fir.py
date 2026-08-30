from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Callable

import fitz
import pytesseract
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel, Field, ValidationError

from app.deps import get_current_user
from app.services import intake_intel
from app.services.ai_privacy import PrivacyContext
from app.services.case_access import create_audit_log, require_case_write, require_fir_upload
from app.services.job_store import JobCapacityError, fir_jobs
from app.services.openrouter import chat_completion

router = APIRouter(prefix="/api/fir", tags=["fir"])

# Scanned FIRs from Karnataka are commonly bilingual — the printed form and many
# handwritten entries are in Kannada, the rest in English. Asking Tesseract for
# both scripts in one pass recognises far more than English alone.
OCR_LANGS = "eng+kan"
MAX_FIR_UPLOAD_BYTES = 20 * 1024 * 1024
ALLOWED_FIR_CONTENT_TYPES = {"application/pdf", "image/jpeg", "image/png"}

# pytesseract is only a wrapper around the `tesseract` CLI; the pip install does
# not bring the binary. Without it every upload died as an unhandled 500, which
# reaches the browser as an opaque "failed to fetch" with no CORS headers.
OCR_MISSING_DETAIL = (
    "OCR engine not available on the server. Install Tesseract "
    "(macOS: `brew install tesseract tesseract-lang`, "
    "Debian/Ubuntu: `apt-get install tesseract-ocr tesseract-ocr-kan`) and restart the API."
)


def _ocr_image(image: Image.Image) -> str:
    """Run OCR, converting a missing binary into an actionable HTTP error."""
    try:
        return pytesseract.image_to_string(image, lang=OCR_LANGS)
    except pytesseract.TesseractNotFoundError as exc:
        raise HTTPException(status_code=503, detail=OCR_MISSING_DETAIL) from exc
    except pytesseract.TesseractError as exc:
        # Most often a missing language pack; fall back to English rather than
        # failing the whole upload.
        try:
            return pytesseract.image_to_string(image)
        except Exception:
            raise HTTPException(
                status_code=422, detail=f"OCR failed on this scan: {exc}"
            ) from exc

EXTRACT_SYSTEM_PROMPT = '''Extract the following fields from the OCR text of an FIR report. Return ONLY valid JSON matching this schema:
{
  "accusedNames": ["string"],
  "victimName": "string | null",
  "incidentDate": "ISO date string or 'Unknown'",
  "location": "string",
  "crimeType": "string",
  "narrativeSummary": "short summary",
  "modusOperandi": "concise description of the specific behavior or method used"
}'''


class ExtractedData(BaseModel):
    accusedNames: list[str] = Field(default_factory=list)
    victimName: str | None = None
    incidentDate: str = "Unknown"
    location: str = ""
    crimeType: str = "Unknown"
    narrativeSummary: str = ""
    modusOperandi: str = ""


async def _extract_fir_fields(raw_text: str, officer: dict) -> ExtractedData:
    privacy_context = PrivacyContext(
        purpose="FIR_OCR_EXTRACTION",
        officer_id=officer["id"],
    )
    completion = await chat_completion(
        [
            {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
            {"role": "user", "content": f"OCR Text:\n{raw_text}"},
        ],
        response_format={"type": "json_object"},
        privacy_context=privacy_context,
    )
    response_text = completion if isinstance(completion, str) else completion.get("content") or "{}"
    try:
        return ExtractedData.model_validate(json.loads(response_text))
    except (json.JSONDecodeError, ValidationError):
        retry = await chat_completion(
            [
                {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
                {"role": "user", "content": f"OCR Text:\n{raw_text}"},
                {"role": "assistant", "content": response_text},
                {
                    "role": "user",
                    "content": "The JSON was invalid or missing fields. Return ONLY valid JSON exactly matching the schema.",
                },
            ],
            response_format={"type": "json_object"},
            privacy_context=privacy_context,
        )
        retry_text = retry if isinstance(retry, str) else retry.get("content") or "{}"
        return ExtractedData.model_validate(json.loads(retry_text))


def _extract_text_from_pdf(content: bytes) -> str:
    doc = fitz.open(stream=content, filetype="pdf")
    text = "\n".join(page.get_text() for page in doc).strip()
    if text:
        return text

    # Scanned/image-only PDF — no embedded text layer, rasterize and OCR each page.
    ocr_parts = []
    for page in doc:
        pixmap = page.get_pixmap(dpi=200)
        image = Image.open(BytesIO(pixmap.tobytes("png")))
        ocr_parts.append(_ocr_image(image))
    return "\n".join(ocr_parts).strip()


async def _process_fir(
    content: bytes,
    content_type: str,
    filename: str,
    officer: dict,
    on_stage: Callable[[str], None] | None = None,
) -> dict:
    """The actual intake pipeline: OCR → field extraction → lead matching."""

    def stage(label: str) -> None:
        if on_stage:
            on_stage(label)

    raw_text = ""

    if content_type.startswith("image/"):
        image = Image.open(BytesIO(content))
        raw_text = _ocr_image(image)
    elif content_type == "application/pdf":
        raw_text = _extract_text_from_pdf(content)
    else:
        raise HTTPException(
            status_code=415,
            detail="Only image or PDF FIR scans are supported.",
        )

    if not raw_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Couldn't read this scan clearly — try a sharper photo or a text-searchable PDF.",
        )

    stage("Extracting FIR fields")
    extracted_data = await _extract_fir_fields(raw_text, officer)

    stage("Searching for prior leads")
    station_id = officer.get("stationId")
    identity = intake_intel.find_identity_matches(
        names=[
            *extracted_data.accusedNames,
            *([extracted_data.victimName] if extracted_data.victimName else []),
        ],
        station_id=station_id,
    )
    mo_similar = intake_intel.find_mo_similar_cases(
        station_id=station_id,
        crime_type=extracted_data.crimeType,
        summary=extracted_data.narrativeSummary,
        modus_operandi=extracted_data.modusOperandi,
        take=4,
    )

    possible_matches = [
        *[
            {
                "personId": m["personId"],
                "name": m["name"],
                "reason": m["reason"],
                "confidenceScore": m["confidenceScore"],
                "priorFirNumbers": m["priorFirNumbers"],
                "isMoMatch": False,
            }
            for m in identity
        ],
        *[
            {
                "personId": None,
                "matchedCaseId": m["caseId"],
                "name": m["firNumber"],
                "reason": f'MO_SIMILAR: {m["reason"]}',
                "confidenceScore": m["similarityScore"],
                "isMoMatch": True,
            }
            for m in mo_similar
        ],
    ]

    create_audit_log(
        officer["id"],
        "FIR_UPLOAD",
        "FIR",
        details=f"Uploaded {filename or 'scan'} ({content_type or 'unknown type'})",
    )

    return {
        "rawText": raw_text,
        "extractedData": extracted_data.model_dump(),
        "possibleMatches": possible_matches,
        "identityPreview": identity,
        "moSimilarPreview": mo_similar,
    }


async def _run_job(job_id: str, content: bytes, content_type: str, filename: str, officer: dict) -> None:
    """Drive one job to completion, recording progress and any failure."""
    try:
        fir_jobs.set_stage(job_id, "Reading scan (OCR)")
        result = await _process_fir(
            content, content_type, filename, officer,
            on_stage=lambda label: fir_jobs.set_stage(job_id, label),
        )
        fir_jobs.finish(job_id, result)
    except HTTPException as exc:
        fir_jobs.fail(job_id, str(exc.detail))
    except Exception as exc:  # noqa: BLE001 - surface the reason to the officer
        fir_jobs.fail(job_id, f"Processing failed: {exc}")


@router.post("/upload")
async def upload_fir(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Accept a scan and return immediately with a job id.

    The heavy work runs after the response is sent, so the officer can navigate
    away, keep working, or queue another scan without losing this one.
    """
    officer = current_user["officer"]
    require_case_write(officer)
    require_fir_upload(officer)

    content = await file.read(MAX_FIR_UPLOAD_BYTES + 1)
    if len(content) > MAX_FIR_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="FIR scans must be 20 MB or smaller.")
    content_type = (file.content_type or "").lower()
    filename = Path(file.filename or "scan").name[:255] or "scan"

    if content_type not in ALLOWED_FIR_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Only PDF, JPEG, or PNG FIR scans are supported.",
        )

    try:
        job = fir_jobs.create(
            officer["id"],
            filename,
            document_content=content,
            document_content_type=content_type,
        )
    except JobCapacityError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    background_tasks.add_task(_run_job, job.id, content, content_type, filename, officer)
    return {"jobId": job.id, "filename": filename, "status": job.status}


@router.get("/jobs")
def list_jobs(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    return {"jobs": [job.summary() for job in fir_jobs.list_for(officer["id"])]}


@router.get("/jobs/{job_id}")
def get_job(job_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    job = fir_jobs.get(job_id, officer["id"])
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.as_dict()


@router.delete("/jobs/{job_id}")
def discard_job(job_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    if not fir_jobs.discard(job_id, officer["id"]):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"discarded": True}
