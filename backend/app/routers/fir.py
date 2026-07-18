from __future__ import annotations

import json
from io import BytesIO

import pytesseract
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel, Field, ValidationError

from app.deps import get_current_user
from app.services import intake_intel
from app.services.openrouter import chat_completion

router = APIRouter(prefix="/api/fir", tags=["fir"])

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


async def _extract_fir_fields(raw_text: str) -> ExtractedData:
    completion = await chat_completion(
        [
            {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
            {"role": "user", "content": f"OCR Text:\n{raw_text}"},
        ],
        model="nvidia/nemotron-3-ultra-550b-a55b:free",
        response_format={"type": "json_object"},
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
            model="google/gemini-1.5-pro",
            response_format={"type": "json_object"},
        )
        retry_text = retry if isinstance(retry, str) else retry.get("content") or "{}"
        return ExtractedData.model_validate(json.loads(retry_text))


@router.post("/upload")
async def upload_fir(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    _ = current_user
    content = await file.read()
    raw_text = ""

    if file.content_type and file.content_type.startswith("image/"):
        image = Image.open(BytesIO(content))
        raw_text = pytesseract.image_to_string(image)

    if not raw_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Couldn't read this scan clearly — try a sharper photo",
        )

    extracted_data = await _extract_fir_fields(raw_text)
    officer = current_user["officer"]

    identity = intake_intel.find_identity_matches(
        names=[
            *extracted_data.accusedNames,
            *([extracted_data.victimName] if extracted_data.victimName else []),
        ],
        station_id=officer["stationId"],
    )
    mo_similar = intake_intel.find_mo_similar_cases(
        station_id=officer["stationId"],
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

    return {
        "rawText": raw_text,
        "extractedData": extracted_data.model_dump(),
        "possibleMatches": possible_matches,
        "identityPreview": identity,
        "moSimilarPreview": mo_similar,
    }
