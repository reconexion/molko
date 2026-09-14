from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.services.transcode_service import (
    JobNotFoundError,
    TranscodeError,
    get_status,
    pop_result,
    start_job,
)

router = APIRouter(prefix="/transcode", tags=["transcode"])

# Generous cap matching the frontend's per-file limit (see MAX_FILE_BYTES in
# frontend/src/lib/ffmpeg.ts) — this endpoint only runs for clips the browser
# already accepted at that size.
MAX_VIDEO_BYTES = 300 * 1024 * 1024


@router.post("")
async def create_transcode(video: UploadFile):
    video_bytes = await video.read()
    if not video_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo de video vacío")
    if len(video_bytes) > MAX_VIDEO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El video es demasiado grande para convertir",
        )

    suffix = Path(video.filename or "input.mp4").suffix or ".mp4"
    job_id = start_job(video_bytes, suffix)
    return {"job_id": job_id}


@router.get("/{job_id}")
async def get_transcode_status(job_id: str):
    try:
        job = get_status(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job no encontrado") from exc

    return {"status": job.status, "progress": job.progress, "error": job.error}


@router.get("/{job_id}/file")
async def get_transcode_file(job_id: str):
    try:
        output_bytes = pop_result(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job no encontrado") from exc
    except TranscodeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return Response(content=output_bytes, media_type="video/mp4")
