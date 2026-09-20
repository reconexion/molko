"""Pruebas de seguridad: cada una reproduce un ataque real de la auditoría."""

import asyncio
import http.server
import os
import shutil
import subprocess
import sys
import threading
import types
import uuid
from pathlib import Path

import httpx
import pytest

from app.api.routes import transcode as transcode_routes
from app.api.routes import youtube as youtube_routes
from app.core.config import settings
from app.main import app
from app.services import transcode_service, youtube_service
from app.services.job_limits import JobLimiter, TooManyConcurrentJobsError
from tests.conftest import PASSWORD, register, set_subscription

YT_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
BACKEND_DIR = Path(__file__).resolve().parents[1]
requires_ffmpeg = pytest.mark.skipif(not (shutil.which("ffmpeg") and shutil.which("ffprobe")), reason="necesita ffmpeg")


# ---------------------------------------------------------------- SSRF en /transcode


class Sink:
    """Servidor HTTP local que registra cada petición: representa un servicio 'interno'."""

    def __init__(self):
        self.hits: list[str] = []
        sink = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                sink.hits.append(self.path)
                self.send_response(404)
                self.end_headers()

            do_HEAD = do_GET

            def log_message(self, *args):
                pass

        self._server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self._server.server_address[1]}"

    def close(self):
        self._server.shutdown()


@pytest.fixture
def sink():
    server = Sink()
    yield server
    server.close()


def dash_manifest(base_url: str) -> bytes:
    return f"""<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT1S" minBufferTime="PT1S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">
 <Period><AdaptationSet mimeType="video/mp4"><Representation id="1" bandwidth="1000" codecs="avc1.42E01E" width="64" height="64">
 <BaseURL>{base_url}</BaseURL><SegmentBase indexRange="0-500"/></Representation></AdaptationSet></Period></MPD>""".encode()


def run_job(video_bytes: bytes, user_id: int = 1):
    async def go():
        job_id = transcode_service.start_job(user_id, video_bytes)
        for _ in range(300):
            job = transcode_service._jobs[job_id]
            if job.status != "running":
                return job_id, job
            await asyncio.sleep(0.1)
        raise AssertionError("el job no terminó")

    return asyncio.run(go())


def make_video(tmp_path: Path, codec: str, extension: str) -> bytes:
    path = tmp_path / f"clip.{extension}"
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=64x64:rate=5:duration=1",
         "-c:v", codec, "-pix_fmt", "yuv420p", str(path)],
        check=True,
    )
    return path.read_bytes()


@requires_ffmpeg
def test_dash_manifest_cannot_make_the_server_fetch_urls(sink):
    # Sin arreglo, ffmpeg detecta DASH por contenido (aunque el archivo se llame .mp4),
    # descarga BaseURL desde el servidor y devuelve el video re-codificado.
    _, job = run_job(dash_manifest(f"{sink.url}/internal-secret.mp4"))
    assert job.status == "error"
    assert job.error_code == "unsupported_format"
    assert sink.hits == []


@requires_ffmpeg
@pytest.mark.parametrize(
    "content",
    [
        b"#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.0,\nhttp://127.0.0.1:1/seg.ts\n#EXT-X-ENDLIST\n",
        b"ffconcat version 1.0\nfile /etc/hostname\n",
        b"v=0\no=- 0 0 IN IP4 127.0.0.1\ns=x\nc=IN IP4 127.0.0.1\nt=0 0\nm=video 5004 RTP/AVP 96\n",
        b"not a video at all",
    ],
)
def test_playlist_and_junk_uploads_are_rejected(content):
    _, job = run_job(content)
    assert job.status == "error"
    assert job.error_code == "unsupported_format"


@requires_ffmpeg
@pytest.mark.parametrize("codec,extension", [("libx264", "mp4"), ("libvpx-vp9", "webm")])
def test_real_videos_still_transcode(tmp_path, codec, extension):
    _, job = run_job(make_video(tmp_path, codec, extension))
    assert job.status == "done"
    assert job.result and len(job.result) > 500


def test_transcode_errors_do_not_leak_server_paths():
    _, job = run_job(b"not a video at all")
    assert "/tmp" not in (job.error or "")
    assert "molko-transcode" not in (job.error or "")


# ---------------------------------------------------------------- propiedad de los jobs


@requires_ffmpeg
def test_transcode_jobs_belong_to_their_owner(tmp_path):
    job_id, _ = run_job(make_video(tmp_path, "libx264", "mp4"), user_id=1)
    with pytest.raises(transcode_service.JobNotFoundError):
        transcode_service.get_status(job_id, user_id=2)
    with pytest.raises(transcode_service.JobNotFoundError):
        transcode_service.pop_result(job_id, user_id=2)
    assert transcode_service.get_status(job_id, user_id=1).status == "done"
    assert transcode_service.pop_result(job_id, user_id=1)


def test_transcode_routes_hide_other_users_jobs(client, subscriber):
    transcode_service._jobs["ajeno"] = transcode_service.TranscodeJob(owner_user_id=999999, status="done", result=b"x")
    try:
        assert client.get("/transcode/ajeno", headers=subscriber).status_code == 404
        assert client.get("/transcode/ajeno/file", headers=subscriber).status_code == 404
    finally:
        transcode_service._jobs.pop("ajeno", None)


# ---------------------------------------------------------------- límite mensual y concurrencia


@pytest.fixture
def slow_youtube(monkeypatch):
    """Un probe lento deja abierta la ventana entre 'contar' y 'registrar'."""
    started = []

    async def slow_probe(url):
        await asyncio.sleep(0.4)
        return 60.0

    def fake_start_job(*args):
        job_id = uuid.uuid4().hex
        started.append(job_id)
        return job_id

    monkeypatch.setattr(youtube_routes, "probe_duration_seconds", slow_probe)
    monkeypatch.setattr(youtube_routes, "start_job", fake_start_job)
    monkeypatch.setattr(
        youtube_routes,
        "get_status",
        lambda job_id: types.SimpleNamespace(status="running", progress=0.1, error=None, error_code=None, title=None),
    )
    return started


def test_parallel_requests_cannot_exceed_the_monthly_limit(client, subscriber, slow_youtube, monkeypatch):
    monkeypatch.setattr(settings, "youtube_monthly_limit", 2)

    # One event loop, like uvicorn: the requests interleave at the probe's await.
    async def fire():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as api:
            responses = await asyncio.gather(
                *[api.post("/youtube", json={"url": YT_URL}, headers=subscriber) for _ in range(10)]
            )
        return [response.status_code for response in responses]

    statuses = asyncio.run(fire())

    assert statuses.count(200) <= 2, f"se iniciaron {len(slow_youtube)} descargas con límite 2: {statuses}"


def test_job_limiter_caps_concurrent_jobs_per_user():
    limiter = JobLimiter(max_per_user=2)
    limiter.acquire(1)
    limiter.acquire(1)
    with pytest.raises(TooManyConcurrentJobsError):
        limiter.acquire(1)
    limiter.acquire(2)  # otro usuario no se ve afectado
    limiter.release(1)
    limiter.acquire(1)


def test_youtube_route_reports_too_many_concurrent_jobs(client, subscriber, monkeypatch):
    async def fake_probe(url):
        return 60.0

    def refuse(*args):
        raise TooManyConcurrentJobsError()

    monkeypatch.setattr(youtube_routes, "probe_duration_seconds", fake_probe)
    monkeypatch.setattr(youtube_routes, "start_job", refuse)
    res = client.post("/youtube", json={"url": YT_URL}, headers=subscriber)
    assert res.status_code == 429
    assert res.json()["detail"]["code"] == "too_many_concurrent_jobs"


# ---------------------------------------------------------------- límites de tasa


def test_transcode_starts_are_rate_limited_per_account(client, subscriber):
    empty = {"video": ("v.mp4", b"", "video/mp4")}
    statuses = [client.post("/transcode", files=empty, headers=subscriber).status_code for _ in range(21)]
    assert statuses[:20] == [400] * 20
    assert statuses[20] == 429

    register(client, "otro@molko.dev")
    set_subscription("otro@molko.dev")
    login = client.post("/auth/login", json={"email": "otro@molko.dev", "password": PASSWORD})
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.post("/transcode", files=empty, headers=other).status_code == 400  # límite por cuenta, no global


def test_checkout_and_portal_are_rate_limited(client, subscriber):
    statuses = [
        client.post("/billing/checkout-session", json={"plan": "monthly"}, headers=subscriber).status_code
        for _ in range(21)
    ]
    assert statuses[:20] == [409] * 20  # ya suscrito: llega al endpoint pero no cobra
    assert statuses[20] == 429


def test_login_failures_are_throttled_per_account_across_ips(client):
    register(client, "victima@molko.dev")

    async def login_from(ip: str, password: str) -> int:
        transport = httpx.ASGITransport(app=app, client=(ip, 50000))
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as api:
            return (await api.post("/auth/login", json={"email": "victima@molko.dev", "password": password})).status_code

    async def attack():
        # 10 fallos desde 10 IPs distintas: el límite por IP nunca salta, el de cuenta sí.
        failures = [await login_from(f"10.0.0.{n}", f"mala-{n}-clave") for n in range(10)]
        return failures, await login_from("10.0.1.1", PASSWORD)

    failures, with_right_password = asyncio.run(attack())
    assert failures == [401] * 10
    assert with_right_password == 429


def test_successful_login_clears_the_failure_count(client):
    register(client, "ana2@molko.dev")
    for n in range(5):
        client.post("/auth/login", json={"email": "ana2@molko.dev", "password": f"mala-{n}-clave"})
    assert client.post("/auth/login", json={"email": "ana2@molko.dev", "password": PASSWORD}).status_code == 200


def test_global_per_ip_flood_limit(client):
    statuses = [client.get("/health").status_code for _ in range(605)]
    assert 429 in statuses
    assert statuses[:500].count(200) == 500


# ---------------------------------------------------------------- tamaño de cuerpo


def test_oversized_bodies_are_rejected_before_being_read(client):
    big = b"x" * (2 * 1024 * 1024)
    for path in ("/billing/webhook", "/auth/register", "/waitlist"):
        res = client.post(path, content=big, headers={"content-type": "application/json"})
        assert res.status_code == 413, path
        assert res.json()["detail"]["code"] == "request_too_large"


def test_transcode_upload_allows_bigger_bodies_than_the_default(client, subscriber, monkeypatch):
    monkeypatch.setattr(transcode_routes, "start_job", lambda *args: "job-de-prueba")
    files = {"video": ("v.mp4", b"x" * (2 * 1024 * 1024), "video/mp4")}
    assert client.post("/transcode", files=files, headers=subscriber).status_code == 200


# ---------------------------------------------------------------- sesiones


def test_logout_revokes_every_earlier_token(client):
    headers = register(client, "sesion@molko.dev")
    stolen = dict(headers)
    assert client.get("/auth/me", headers=headers).status_code == 200

    assert client.post("/auth/logout", headers=headers).status_code == 204
    assert client.get("/auth/me", headers=stolen).status_code == 401

    relogin = client.post("/auth/login", json={"email": "sesion@molko.dev", "password": PASSWORD})
    assert relogin.status_code == 200
    fresh = {"Authorization": f"Bearer {relogin.json()['access_token']}"}
    assert client.get("/auth/me", headers=fresh).status_code == 200


def test_logout_requires_a_session(client):
    assert client.post("/auth/logout").status_code == 401


def run_app_snippet(code: str, **env) -> subprocess.CompletedProcess:
    environment = {**os.environ, "DATABASE_URL": "sqlite:///:memory:", **env}
    return subprocess.run(
        [sys.executable, "-c", code], cwd=BACKEND_DIR, env=environment, capture_output=True, text=True, timeout=60
    )


@pytest.mark.parametrize("secret", ["change-me-in-production", "corto", ""])
def test_server_refuses_to_start_with_a_default_or_weak_jwt_secret(secret):
    result = run_app_snippet("import app.main", JWT_SECRET=secret)
    assert result.returncode != 0
    assert "JWT_SECRET" in result.stderr


def test_docs_are_off_in_production_and_on_in_development():
    snippet = (
        "from fastapi.testclient import TestClient; from app.main import app; c = TestClient(app);"
        "print([c.get(p).status_code for p in ('/docs', '/redoc', '/openapi.json')])"
    )
    strong = "x" * 40
    assert "[404, 404, 404]" in run_app_snippet(snippet, JWT_SECRET=strong, ENVIRONMENT="production").stdout
    assert "[200, 200, 200]" in run_app_snippet(snippet, JWT_SECRET=strong, ENVIRONMENT="development").stdout


# ---------------------------------------------------------------- cabeceras y CORS


def test_security_headers_on_every_response(client):
    headers = client.get("/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "no-referrer"
    assert headers["cache-control"] == "no-store"
    assert "frame-ancestors 'none'" in headers["content-security-policy"]


def test_cors_allows_only_configured_origins_without_credentials(client):
    preflight = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization"}
    allowed = client.options("/auth/login", headers={"Origin": "http://localhost:5173", **preflight})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in allowed.headers

    denied = client.options("/auth/login", headers={"Origin": "https://evil.example", **preflight})
    assert "access-control-allow-origin" not in denied.headers


def test_rejections_from_inner_layers_still_carry_cors_headers(client):
    res = client.post(
        "/auth/register", content=b"x" * (2 * 1024 * 1024), headers={"Origin": "http://localhost:5173", "content-type": "application/json"}
    )
    assert res.status_code == 413
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"


# ---------------------------------------------------------------- yt-dlp


def test_youtube_url_is_rebuilt_from_the_video_id():
    assert youtube_service.canonical_youtube_url("https://youtu.be/dQw4w9WgXcQ?t=5") == YT_URL
    assert youtube_service.canonical_youtube_url("https://m.youtube.com/shorts/dQw4w9WgXcQ") == YT_URL
    assert youtube_service.canonical_youtube_url("http://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x") == YT_URL
    assert youtube_service.canonical_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ\n") is None
    assert youtube_service.canonical_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=otro") == YT_URL


def test_time_values_must_match_exactly():
    # con match() + "$", el "\n" final se colaba hasta los argumentos de yt-dlp
    assert youtube_service.TIME_REGEX.fullmatch("00:10:00")
    assert not youtube_service.TIME_REGEX.fullmatch("00:10:00\n")
    assert not youtube_service.TIME_REGEX.fullmatch("00:10:00 --exec x")


def test_ytdlp_only_uses_the_youtube_extractor():
    for args in (
        youtube_service._build_args(YT_URL, "1080p", "original", None, None, Path("/tmp/x")),
    ):
        index = args.index("--use-extractors")
        assert args[index + 1] == "youtube"
        assert args[0] == YT_URL


def test_ytdlp_errors_do_not_leak_server_details(tmp_path, monkeypatch):
    fake = tmp_path / "yt-dlp"
    fake.write_text("#!/bin/sh\necho 'ERROR: /home/deploy/secret/path cookies=abc123' >&2\nexit 1\n")
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}{os.environ['PATH']}")

    with pytest.raises(youtube_service.YoutubeDownloadError) as caught:
        asyncio.run(youtube_service.probe_duration_seconds(YT_URL))
    assert "secret" not in str(caught.value)
    assert caught.value.code == "youtube_unavailable"
