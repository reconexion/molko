from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.api.deps import require_active_subscription
from app.models.user import User
from app.schemas.transcription import TranscriptResponse
from app.services.transcription_service import TranscriptionError, transcribe_audio

router = APIRouter(prefix="/transcription", tags=["transcription"])

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25MB, generous for a short brainrot clip's audio track


@router.post("", response_model=TranscriptResponse)
async def create_transcription(
    audio: UploadFile,
    language: str = "es",
    _current_user: User = Depends(require_active_subscription),
):
    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El audio extraído es demasiado grande para transcribir",
        )
    if not audio_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo de audio vacío")

    try:
        result = await transcribe_audio(audio_bytes, audio.content_type or "audio/webm", language)
    except TranscriptionError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return result
