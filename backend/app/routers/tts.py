from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
import edge_tts

router = APIRouter(prefix="/api", tags=["tts"])

VOICE_MAP = {
    "kn-IN": "kn-IN-GaganNeural", 
    "en-IN": "en-IN-NeerjaNeural",
    "en-US": "en-US-AriaNeural",
}

@router.get("/tts")
async def get_tts(text: str = Query(...), lang: str = Query("en-IN")):
    voice = VOICE_MAP.get(lang, "en-IN-NeerjaNeural")
    communicate = edge_tts.Communicate(text, voice)
    
    async def generate():
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]

    return StreamingResponse(generate(), media_type="audio/mpeg")
