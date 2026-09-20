import asyncio

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import require_active_subscription, user_rate_limit
from app.core.config import settings
from app.core.errors import api_error
from app.db.base import get_db
from app.models.usage import YoutubeDownload
from app.models.user import User
from app.schemas.youtube import YoutubeDownloadRequest, YoutubeStatusResponse
from app.services.usage_service import youtube_downloads_this_month
from app.services.youtube_service import (
    AUDIO_LANG_SET,
    TIME_REGEX,
    VIDEO_QUALITY_MAP,
    JobNotFoundError,
    TooManyConcurrentJobsError,
    YoutubeDownloadError,
    canonical_youtube_url,
    get_status,
    hms_to_seconds,
    pop_result,
    probe_duration_seconds,
    start_job,
)

router = APIRouter(prefix="/youtube", tags=["youtube"])

# Each start spawns yt-dlp twice (probe + download) even when the quota still allows it.
youtube_rate_limit = user_rate_limit("youtube", limit=30, window_seconds=3600)

# One account's starts run one at a time: otherwise N parallel requests all read the
# same "downloads used" count before any of them records its own and all pass the limit.
_user_locks: dict[int, asyncio.Lock] = {}


def _job_not_found():
    return api_error(status.HTTP_404_NOT_FOUND, "job_not_found", "Job no encontrado")


def _own_download(db: Session, user: User, job_id: str) -> YoutubeDownload:
    download = (
        db.query(YoutubeDownload)
        .filter(YoutubeDownload.job_id == job_id, YoutubeDownload.user_id == user.id)
        .first()
    )
    if download is None:
        raise _job_not_found()
    return download


@router.post("", dependencies=[Depends(youtube_rate_limit)])
async def create_youtube_download(
    payload: YoutubeDownloadRequest,
    user: User = Depends(require_active_subscription),
    db: Session = Depends(get_db),
):
    if not settings.youtube_enabled:
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE, "youtube_disabled", "El descargador está desactivado temporalmente"
        )
    url = canonical_youtube_url(payload.url)
    if url is None:
        raise api_error(status.HTTP_400_BAD_REQUEST, "invalid_youtube_url", "URL de YouTube inválida")
    if payload.quality not in VIDEO_QUALITY_MAP:
        raise api_error(status.HTTP_400_BAD_REQUEST, "invalid_quality", "Calidad de video inválida")
    if payload.audio_lang not in AUDIO_LANG_SET:
        raise api_error(status.HTTP_400_BAD_REQUEST, "invalid_audio_lang", "Idioma de audio inválido")
    if payload.start_time and not TIME_REGEX.fullmatch(payload.start_time):
        raise api_error(status.HTTP_400_BAD_REQUEST, "invalid_start_time", "Formato de tiempo de inicio inválido")
    if payload.end_time and not TIME_REGEX.fullmatch(payload.end_time):
        raise api_error(status.HTTP_400_BAD_REQUEST, "invalid_end_time", "Formato de tiempo de fin inválido")

    async with _user_locks.setdefault(user.id, asyncio.Lock()):
        if youtube_downloads_this_month(db, user.id) >= settings.youtube_monthly_limit:
            raise api_error(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "youtube_monthly_limit",
                f"Ya usaste tus {settings.youtube_monthly_limit} descargas de este mes",
                limit=settings.youtube_monthly_limit,
            )

        try:
            total_seconds = await probe_duration_seconds(url)
        except YoutubeDownloadError as exc:
            raise api_error(status.HTTP_502_BAD_GATEWAY, exc.code or "upstream_error", str(exc)) from exc

        start_seconds = hms_to_seconds(payload.start_time) if payload.start_time else 0
        end_seconds = min(hms_to_seconds(payload.end_time), total_seconds) if payload.end_time else total_seconds
        if end_seconds <= start_seconds:
            raise api_error(status.HTTP_400_BAD_REQUEST, "empty_trim", "El recorte no incluye nada del video")
        if end_seconds - start_seconds > settings.youtube_max_duration_seconds:
            max_minutes = settings.youtube_max_duration_seconds // 60
            raise api_error(
                status.HTTP_400_BAD_REQUEST,
                "youtube_too_long",
                f"El video (o el recorte) dura más de {max_minutes} minutos, que es el máximo permitido",
                minutes=max_minutes,
            )

        try:
            job_id = start_job(user.id, url, payload.quality, payload.audio_lang, payload.start_time, payload.end_time)
        except TooManyConcurrentJobsError:
            raise api_error(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "too_many_concurrent_jobs",
                "Ya tienes descargas en curso, espera a que terminen",
            )
        db.add(YoutubeDownload(user_id=user.id, job_id=job_id))
        db.commit()
    return {"job_id": job_id}


@router.get("/{job_id}", response_model=YoutubeStatusResponse)
async def get_youtube_status(
    job_id: str,
    user: User = Depends(require_active_subscription),
    db: Session = Depends(get_db),
):
    download = _own_download(db, user, job_id)
    try:
        job = get_status(job_id)
    except JobNotFoundError as exc:
        raise _job_not_found() from exc

    # Una descarga que falló no debe gastar cuota del mes.
    if job.status == "error":
        db.delete(download)
        db.commit()

    return YoutubeStatusResponse(
        status=job.status, progress=job.progress, error=job.error, error_code=job.error_code, title=job.title
    )


@router.get("/{job_id}/file")
async def get_youtube_file(
    job_id: str,
    user: User = Depends(require_active_subscription),
    db: Session = Depends(get_db),
):
    _own_download(db, user, job_id)
    try:
        video_bytes, title = pop_result(job_id)
    except JobNotFoundError as exc:
        raise _job_not_found() from exc
    except YoutubeDownloadError as exc:
        raise api_error(status.HTTP_409_CONFLICT, exc.code or "upstream_error", str(exc)) from exc

    return Response(
        content=video_bytes,
        media_type="video/mp4",
        headers={"Content-Disposition": f'attachment; filename="{title}.mp4"'},
    )
