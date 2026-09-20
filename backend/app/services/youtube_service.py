import asyncio
import logging
import re
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import parse_qs, urlparse

from app.services.job_limits import JobLimiter, TooManyConcurrentJobsError  # noqa: F401

JobStatus = Literal["running", "done", "error"]

TIME_REGEX = re.compile(r"\d{2}:\d{2}:\d{2}")
PROGRESS_REGEX = re.compile(r"\[download\]\s+(\d{1,3}(?:\.\d+)?)%")

VIDEO_QUALITY_MAP = {
    "480p": 480,
    "720p": 720,
    "1080p": 1080,
    "2K": 1440,
    "4K": 2160,
}

AUDIO_LANG_SET = {"original", "es", "en", "pt", "fr", "de", "ja", "ko", "it", "ru", "hi", "ar"}


@dataclass
class YoutubeJob:
    owner_user_id: int
    status: JobStatus = "running"
    progress: float = 0.0
    error: Optional[str] = None
    error_code: Optional[str] = None
    title: Optional[str] = None
    result: Optional[bytes] = None


class YoutubeDownloadError(Exception):
    def __init__(self, message: str, code: Optional[str] = None):
        super().__init__(message)
        self.code = code


class JobNotFoundError(Exception):
    pass


# In-memory job store, same reasoning as transcode_service: single local-machine
# dev backend, no multi-worker deployment — a process-wide dict is enough, and
# each job is dropped once its result has been fetched (see pop_result).
_jobs: dict[str, YoutubeJob] = {}


YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}

PROBE_TIMEOUT_SECONDS = 45
MAX_DOWNLOAD_SECONDS = 30 * 60
# The finished file is read fully into memory (job.result), so this bounds RAM per job.
MAX_DOWNLOAD_SIZE = "1G"

_limiter = JobLimiter(max_per_user=2)


VIDEO_ID_REGEX = re.compile(r"[A-Za-z0-9_-]{11}")
SHORT_PATH_REGEX = re.compile(r"/(?:shorts|embed|live)/([A-Za-z0-9_-]{11})")

logger = logging.getLogger("uvicorn.error")


# Returns a URL rebuilt from the video id alone (or None). The user's text is never
# handed to yt-dlp: it is a general downloader that follows redirects and falls back
# to a generic extractor for unknown paths, and urlparse disagrees with other URL
# parsers on inputs such as "host\@youtube.com".
def canonical_youtube_url(url: str) -> Optional[str]:
    if not url or url != url.strip() or any(ord(char) <= 32 or char == "\\" for char in url):
        return None
    try:
        parsed = urlparse(url)
        port = parsed.port
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or parsed.username or parsed.password or port not in (None, 80, 443):
        return None

    host = (parsed.hostname or "").lower()
    candidate = ""
    if host in ("youtu.be", "www.youtu.be"):
        candidate = parsed.path.lstrip("/").split("/")[0]
    elif host in YOUTUBE_HOSTS:
        if parsed.path == "/watch":
            candidate = (parse_qs(parsed.query).get("v") or [""])[0]
        elif match := SHORT_PATH_REGEX.fullmatch(parsed.path):
            candidate = match.group(1)

    if not VIDEO_ID_REGEX.fullmatch(candidate):
        return None
    return f"https://www.youtube.com/watch?v={candidate}"


def hms_to_seconds(value: str) -> int:
    hours, minutes, seconds = (int(part) for part in value.split(":"))
    return hours * 3600 + minutes * 60 + seconds


async def probe_duration_seconds(url: str) -> float:
    try:
        process = await asyncio.create_subprocess_exec(
            "yt-dlp",
            "--no-playlist",
            "--use-extractors",
            "youtube",
            "--skip-download",
            "--print",
            "duration",
            url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise YoutubeDownloadError("yt-dlp no está instalado en el servidor backend", "ytdlp_not_installed") from exc

    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=PROBE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        process.kill()
        await process.wait()
        raise YoutubeDownloadError("YouTube tardó demasiado en responder", "youtube_timeout") from exc

    if process.returncode != 0:
        logger.warning("yt-dlp no pudo leer %s: %s", url, stderr.decode(errors="replace")[-500:].strip())
        raise YoutubeDownloadError("No se pudo leer el video de YouTube", "youtube_unavailable")

    lines = stdout.decode(errors="replace").strip().splitlines()
    try:
        return float(lines[-1])
    except (IndexError, ValueError) as exc:
        raise YoutubeDownloadError(
            "No se pudo determinar la duración (¿es una transmisión en vivo?)", "youtube_no_duration"
        ) from exc


def _build_section_args(start_time: Optional[str], end_time: Optional[str]) -> list[str]:
    if not start_time and not end_time:
        return []
    section = f"*{start_time or ''}-{end_time or ''}"
    return ["--download-sections", section, "--force-keyframes-at-cuts"]


# YouTube's "language" format field identifies a dub track (multi-audio
# video). Filtering by it picks that dub instead of the original audio, with
# a fallback to the original if the video doesn't have that dub available.
def _audio_selector(audio_lang: str, extra_filter: str = "") -> str:
    if audio_lang and audio_lang != "original":
        return f"bestaudio[language={audio_lang}]{extra_filter}/bestaudio{extra_filter}"
    return f"bestaudio{extra_filter}"


def _build_args(
    url: str,
    quality: str,
    audio_lang: str,
    start_time: Optional[str],
    end_time: Optional[str],
    out_dir: Path,
) -> list[str]:
    max_height = VIDEO_QUALITY_MAP[quality]
    fmt = (
        f"bestvideo[height<={max_height}][ext=mp4]+{_audio_selector(audio_lang, '[ext=m4a]')}"
        f"/best[height<={max_height}][ext=mp4]/best[height<={max_height}]"
    )
    return [
        url,
        "-P",
        str(out_dir),
        "--newline",
        "--no-playlist",
        "--use-extractors",
        "youtube",
        "--max-filesize",
        MAX_DOWNLOAD_SIZE,
        "--socket-timeout",
        "30",
        "--restrict-filenames",
        "-f",
        fmt,
        "--merge-output-format",
        "mp4",
        "-o",
        "%(title)s.%(ext)s",
        *_build_section_args(start_time, end_time),
    ]


async def _run_download(
    job_id: str,
    url: str,
    quality: str,
    audio_lang: str,
    start_time: Optional[str],
    end_time: Optional[str],
) -> None:
    job = _jobs[job_id]
    tmp_dir = Path(tempfile.mkdtemp(prefix="molko-youtube-"))

    try:
        before = set(tmp_dir.iterdir())
        args = _build_args(url, quality, audio_lang, start_time, end_time, tmp_dir)

        process = await asyncio.create_subprocess_exec(
            "yt-dlp",
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        assert process.stdout is not None
        assert process.stderr is not None

        stderr_chunks: list[bytes] = []

        async def read_stderr() -> None:
            while True:
                chunk = await process.stderr.read(4096)
                if not chunk:
                    break
                stderr_chunks.append(chunk)

        async def read_progress() -> None:
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                text = line.decode(errors="replace").strip()
                match = PROGRESS_REGEX.search(text)
                if match:
                    job.progress = min(0.99, round(float(match.group(1)) / 100, 4))

        try:
            await asyncio.wait_for(
                asyncio.gather(read_stderr(), read_progress(), process.wait()), timeout=MAX_DOWNLOAD_SECONDS
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            logger.warning("descarga %s excedió %ss y se canceló", job_id, MAX_DOWNLOAD_SECONDS)
            raise YoutubeDownloadError("La descarga tardó demasiado", "download_failed")

        if process.returncode != 0:
            tail = b"".join(stderr_chunks).decode(errors="replace")[-2000:]
            logger.warning("yt-dlp falló (job %s, código %s): %s", job_id, process.returncode, tail.strip())
            raise YoutubeDownloadError("La descarga falló", "download_failed")

        after = set(tmp_dir.iterdir())
        new_files = [p for p in after - before if p.is_file()]
        if not new_files:
            raise YoutubeDownloadError("yt-dlp no generó ningún archivo", "ytdlp_no_output")

        output_path = max(new_files, key=lambda p: p.stat().st_size)
        job.title = output_path.stem
        job.result = output_path.read_bytes()
        job.progress = 1.0
        job.status = "done"
    except FileNotFoundError:
        job.status = "error"
        job.error = "yt-dlp no está instalado en el servidor backend"
        job.error_code = "ytdlp_not_installed"
    except YoutubeDownloadError as exc:
        job.status = "error"
        job.error = str(exc)
        job.error_code = exc.code
    except Exception:  # keep the job store consistent on any surprise failure
        logger.exception("descarga %s falló de forma inesperada", job_id)
        job.status = "error"
        job.error = "La descarga falló"
        job.error_code = "download_failed"
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        _limiter.release(job.owner_user_id)


def start_job(
    user_id: int,
    url: str,
    quality: str,
    audio_lang: str,
    start_time: Optional[str],
    end_time: Optional[str],
) -> str:
    _limiter.acquire(user_id)
    job_id = uuid.uuid4().hex
    _jobs[job_id] = YoutubeJob(owner_user_id=user_id)
    asyncio.create_task(_run_download(job_id, url, quality, audio_lang, start_time, end_time))
    return job_id


def get_status(job_id: str) -> YoutubeJob:
    job = _jobs.get(job_id)
    if job is None:
        raise JobNotFoundError(job_id)
    # An errored job has no /file step to pop it via, so it's dropped as soon
    # as this first (and, in practice, only) status read reports the error —
    # otherwise it would sit in the store forever.
    if job.status == "error":
        del _jobs[job_id]
    return job


def pop_result(job_id: str) -> tuple[bytes, str]:
    job = _jobs.get(job_id)
    if job is None:
        raise JobNotFoundError(job_id)
    if job.status != "done" or job.result is None:
        raise YoutubeDownloadError("El job todavía no terminó", "job_not_finished")
    result = job.result
    title = job.title or "video"
    del _jobs[job_id]
    return result, title
