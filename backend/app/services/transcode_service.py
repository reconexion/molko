import asyncio
import json
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

JobStatus = Literal["running", "done", "error"]


@dataclass
class TranscodeJob:
    status: JobStatus = "running"
    progress: float = 0.0
    error: Optional[str] = None
    result: Optional[bytes] = None


class TranscodeError(Exception):
    pass


class JobNotFoundError(Exception):
    pass


# In-memory job store — this backend is a single local-machine dev tool with
# no concurrency/multi-worker deployment, so a process-wide dict is enough;
# each job is dropped once its result has been fetched (see pop_result).
_jobs: dict[str, TranscodeJob] = {}


async def _probe_duration_seconds(path: Path) -> Optional[float]:
    process = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
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


async def _run_transcode(job_id: str, video_bytes: bytes, suffix: str) -> None:
    job = _jobs[job_id]
    tmp_dir = Path(tempfile.mkdtemp(prefix="molko-transcode-"))
    input_path = tmp_dir / f"input{suffix}"
    output_path = tmp_dir / "output.mp4"
    input_path.write_bytes(video_bytes)

    try:
        # Needed to turn ffmpeg's -progress "out_time_us" (elapsed time
        # already encoded) into a 0..1 ratio. If it can't be read (e.g. a
        # malformed container), progress just stays at 0 until the job
        # finishes instead of failing the whole conversion over it.
        duration = await _probe_duration_seconds(input_path)

        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-y",
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

        await asyncio.gather(read_stderr(), read_progress(), process.wait())

        if process.returncode != 0:
            tail = b"".join(stderr_chunks).decode(errors="replace")[-2000:]
            raise TranscodeError(f"ffmpeg falló (código {process.returncode}): {tail}")

        job.result = output_path.read_bytes()
        job.progress = 1.0
        job.status = "done"
    except FileNotFoundError:
        job.status = "error"
        job.error = "ffmpeg no está instalado en el servidor backend"
    except TranscodeError as exc:
        job.status = "error"
        job.error = str(exc)
    except Exception as exc:  # keep the job store consistent on any surprise failure
        job.status = "error"
        job.error = str(exc)
    finally:
        input_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        tmp_dir.rmdir()


def start_job(video_bytes: bytes, suffix: str) -> str:
    job_id = uuid.uuid4().hex
    _jobs[job_id] = TranscodeJob()
    asyncio.create_task(_run_transcode(job_id, video_bytes, suffix))
    return job_id


def get_status(job_id: str) -> TranscodeJob:
    job = _jobs.get(job_id)
    if job is None:
        raise JobNotFoundError(job_id)
    # An errored job has no /file step to pop it via, so it's dropped as soon
    # as this first (and, in practice, only) status read reports the error —
    # otherwise it would sit in the store forever.
    if job.status == "error":
        del _jobs[job_id]
    return job


def pop_result(job_id: str) -> bytes:
    job = _jobs.get(job_id)
    if job is None:
        raise JobNotFoundError(job_id)
    if job.status != "done" or job.result is None:
        raise TranscodeError("El job todavía no terminó")
    result = job.result
    del _jobs[job_id]
    return result
