import asyncio
import json
import logging
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

from app.services.job_limits import JobLimiter, TooManyConcurrentJobsError  # noqa: F401

JobStatus = Literal["running", "done", "error"]

# ffmpeg auto-detects the container from the file's CONTENT, so a DASH manifest
# uploaded as "clip.mp4" is still parsed as DASH and makes the server fetch
# attacker-chosen URLs (confirmed SSRF). Forcing the demuxer with -f skips that
# probe: anything that isn't a real mp4/webm just fails to parse.
SAFE_DEMUXERS = ["mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm"]

# Defense in depth only: ffmpeg's dash demuxer ignores this for its own fetches.
FFMPEG_PROTOCOL_ARGS = ["-protocol_whitelist", "file"]

MAX_TRANSCODE_SECONDS = 20 * 60

logger = logging.getLogger("uvicorn.error")


@dataclass
class TranscodeJob:
    owner_user_id: int
    status: JobStatus = "running"
    progress: float = 0.0
    error: Optional[str] = None
    error_code: Optional[str] = None
    result: Optional[bytes] = None


class TranscodeError(Exception):
    def __init__(self, message: str, code: Optional[str] = None):
        super().__init__(message)
        self.code = code


class JobNotFoundError(Exception):
    pass


class UnsupportedFormatError(TranscodeError):
    def __init__(self):
        super().__init__("Formato de video no reconocido o no compatible", "unsupported_format")


# In-memory job store — this backend is a single local-machine dev tool with
# no concurrency/multi-worker deployment, so a process-wide dict is enough;
# each job is dropped once its result has been fetched (see pop_result).
_jobs: dict[str, TranscodeJob] = {}

_limiter = JobLimiter(max_per_user=2)


async def _probe_duration_seconds(path: Path, demuxer: str) -> Optional[float]:
    process = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        *FFMPEG_PROTOCOL_ARGS,
        "-f",
        demuxer,
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await process.communicate()
    if process.returncode != 0:
        return None
    try:
        data = json.loads(stdout)
        return float(data["format"]["duration"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


async def _detect_safe_demuxer(path: Path) -> Optional[str]:
    for demuxer in SAFE_DEMUXERS:
        process = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v",
            "error",
            *FFMPEG_PROTOCOL_ARGS,
            "-f",
            demuxer,
            "-show_entries",
            "format=format_name",
            "-of",
            "json",
            str(path),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        if await process.wait() == 0:
            return demuxer
    return None


async def _run_transcode(job_id: str, video_bytes: bytes) -> None:
    job = _jobs[job_id]
    tmp_dir = Path(tempfile.mkdtemp(prefix="molko-transcode-"))
    input_path = tmp_dir / "input.bin"
    output_path = tmp_dir / "output.mp4"

    try:
        input_path.write_bytes(video_bytes)
        demuxer = await _detect_safe_demuxer(input_path)
        if demuxer is None:
            raise UnsupportedFormatError()

        # Needed to turn ffmpeg's -progress "out_time_us" (elapsed time
        # already encoded) into a 0..1 ratio. If it can't be read (e.g. a
        # malformed container), progress just stays at 0 until the job
        # finishes instead of failing the whole conversion over it.
        duration = await _probe_duration_seconds(input_path, demuxer)

        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-y",
            *FFMPEG_PROTOCOL_ARGS,
            "-f",
            demuxer,
            "-i",
            str(input_path),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            # Machine-readable "key=value" progress lines on stdout, one block
            # per output update, ending each block in "progress=continue" (or
            # "=end" on the last one) — -nostats keeps ffmpeg's normal
            # human-readable stats off stderr so it doesn't get mixed in.
            "-progress",
            "pipe:1",
            "-nostats",
            str(output_path),
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
                if text.startswith("out_time_us="):
                    try:
                        out_time_seconds = int(text.split("=", 1)[1]) / 1_000_000
                    except ValueError:
                        continue
                    if duration:
                        # Capped below 1.0 here — that's only set once the
                        # process has actually exited successfully below.
                        # ffmpeg's very first -progress tick can report a
                        # tiny negative out_time_us before encoding actually
                        # starts moving forward — clamp instead of letting a
                        # negative ratio through.
                        job.progress = max(0.0, min(0.99, out_time_seconds / duration))

        try:
            await asyncio.wait_for(
                asyncio.gather(read_stderr(), read_progress(), process.wait()), timeout=MAX_TRANSCODE_SECONDS
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            logger.warning("transcode %s excedió %ss y se canceló", job_id, MAX_TRANSCODE_SECONDS)
            raise TranscodeError("La conversión tardó demasiado", "conversion_failed")

        if process.returncode != 0:
            tail = b"".join(stderr_chunks).decode(errors="replace")[-2000:]
            logger.warning("transcode %s falló (código %s): %s", job_id, process.returncode, tail)
            raise TranscodeError("La conversión falló", "conversion_failed")

        job.result = output_path.read_bytes()
        job.progress = 1.0
        job.status = "done"
    except FileNotFoundError:
        job.status = "error"
        job.error = "ffmpeg no está instalado en el servidor backend"
        job.error_code = "ffmpeg_not_installed"
    except TranscodeError as exc:
        job.status = "error"
        job.error = str(exc)
        job.error_code = exc.code
    except Exception:  # keep the job store consistent on any surprise failure
        logger.exception("transcode %s falló de forma inesperada", job_id)
        job.status = "error"
        job.error = "La conversión falló"
        job.error_code = "conversion_failed"
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        _limiter.release(job.owner_user_id)


def start_job(user_id: int, video_bytes: bytes) -> str:
    _limiter.acquire(user_id)
    job_id = uuid.uuid4().hex
    _jobs[job_id] = TranscodeJob(owner_user_id=user_id)
    asyncio.create_task(_run_transcode(job_id, video_bytes))
    return job_id


def get_status(job_id: str, user_id: int) -> TranscodeJob:
    job = _jobs.get(job_id)
    if job is None or job.owner_user_id != user_id:
        raise JobNotFoundError(job_id)
    # An errored job has no /file step to pop it via, so it's dropped as soon
    # as this first (and, in practice, only) status read reports the error —
    # otherwise it would sit in the store forever.
    if job.status == "error":
        del _jobs[job_id]
    return job


def pop_result(job_id: str, user_id: int) -> bytes:
    job = _jobs.get(job_id)
    if job is None or job.owner_user_id != user_id:
        raise JobNotFoundError(job_id)
    if job.status != "done" or job.result is None:
        raise TranscodeError("El job todavía no terminó", "job_not_finished")
    result = job.result
    del _jobs[job_id]
    return result
