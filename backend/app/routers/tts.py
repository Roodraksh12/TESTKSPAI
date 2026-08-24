from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
import edge_tts
from pydantic import BaseModel, Field

from app.deps import get_current_user

router = APIRouter(prefix="/api", tags=["tts"])

VOICE_MAP = {
    "kn-IN": "kn-IN-GaganNeural", 
    "en-IN": "en-IN-NeerjaNeural",
    "en-US": "en-US-AriaNeural",
}


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    lang: str = "en-IN"


def _audio_response(text: str, lang: str) -> StreamingResponse:
    voice = VOICE_MAP.get(lang, "en-IN-NeerjaNeural")
    communicate = edge_tts.Communicate(text, voice)

    async def generate():
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]

    return StreamingResponse(generate(), media_type="audio/mpeg")

@router.get("/tts")
async def get_tts(
    text: str = Query(..., min_length=1, max_length=5000),
    lang: str = Query("en-IN"),
    _current_user: dict = Depends(get_current_user),
):
    return _audio_response(text, lang)


@router.post("/tts")
async def post_tts(
    payload: TTSRequest,
    _current_user: dict = Depends(get_current_user),
):
    """POST avoids URL-length failures for longer English/Kannada replies."""
    return _audio_response(payload.text, payload.lang)
