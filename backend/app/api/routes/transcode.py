from fastapi import APIRouter, Depends, UploadFile, status
from fastapi.responses import Response

from app.api.deps import require_active_subscription, user_rate_limit
from app.core.errors import api_error
from app.models.user import User
from app.services.transcode_service import (
    JobNotFoundError,
    TooManyConcurrentJobsError,
    TranscodeError,
    get_status,
    pop_result,
    start_job,
)

router = APIRouter(
    prefix="/transcode",
    tags=["transcode"],
    dependencies=[Depends(require_active_subscription)],
)

# Generous cap matching the frontend's per-file limit (see MAX_FILE_BYTES in
# frontend/src/lib/ffmpeg.ts) — this endpoint only runs for clips the browser
# already accepted at that size.
MAX_VIDEO_BYTES = 300 * 1024 * 1024

# Per-account: each job holds the full upload in memory and runs a real ffmpeg
# process, so this is about capping resource use, not abuse in the usual sense.
transcode_rate_limit = user_rate_limit("transcode", limit=20, window_seconds=3600)


@router.post("", dependencies=[Depends(transcode_rate_limit)])
async def create_transcode(video: UploadFile, user: User = Depends(require_active_subscription)):
    video_bytes = await video.read()
    if not video_bytes:
        raise api_error(status.HTTP_400_BAD_REQUEST, "empty_video", "Archivo de video vacío")
    if len(video_bytes) > MAX_VIDEO_BYTES:
        raise api_error(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "video_too_large_to_convert",
            "El video es demasiado grande para convertir",
        )

    try:
        job_id = start_job(user.id, video_bytes)
    except TooManyConcurrentJobsError:
        raise api_error(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "too_many_concurrent_jobs",
            "Ya tienes conversiones en curso, espera a que terminen",
        )
    return {"job_id": job_id}


@router.get("/{job_id}")
async def get_transcode_status(job_id: str, user: User = Depends(require_active_subscription)):
    try:
        job = get_status(job_id, user.id)
    except JobNotFoundError as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "job_not_found", "Job no encontrado") from exc

    return {"status": job.status, "progress": job.progress, "error": job.error, "error_code": job.error_code}


@router.get("/{job_id}/file")
async def get_transcode_file(job_id: str, user: User = Depends(require_active_subscription)):
    try:
        output_bytes = pop_result(job_id, user.id)
    except JobNotFoundError as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "job_not_found", "Job no encontrado") from exc
    except TranscodeError as exc:
        raise api_error(status.HTTP_409_CONFLICT, exc.code or "upstream_error", str(exc)) from exc

    return Response(content=output_bytes, media_type="video/mp4")
