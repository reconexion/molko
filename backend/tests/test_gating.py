import types
import uuid

import pytest

from app.api.routes import youtube as youtube_routes
from app.core.config import settings
from tests.conftest import register, set_subscription

EMPTY_AUDIO = {"audio": ("a.webm", b"", "audio/webm")}
EMPTY_VIDEO = {"video": ("v.mp4", b"", "video/mp4")}
YT_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def test_transcription_is_switched_off(client, subscriber):
    # Los subtítulos automáticos son una función futura: el endpoint no debe estar
    # expuesto (ni siquiera a suscriptores) ni gastar crédito de Deepgram.
    assert client.post("/transcription", files=EMPTY_AUDIO, headers=subscriber).status_code == 404


def test_paid_endpoints_require_login(client):
    assert client.post("/transcode", files=EMPTY_VIDEO).status_code == 401
    assert client.post("/youtube", json={"url": YT_URL}).status_code == 401
    assert client.get("/transcode/abc").status_code == 401
    assert client.get("/youtube/abc").status_code == 401


def test_paid_endpoints_require_active_subscription(client):
    headers = register(client)
    assert client.post("/transcode", files=EMPTY_VIDEO, headers=headers).status_code == 402
    assert client.post("/youtube", json={"url": YT_URL}, headers=headers).status_code == 402


def test_subscriber_gets_past_the_gate(client, subscriber):
    # 400 = llegó a la validación del propio endpoint (archivo vacío), no fue bloqueado.
    assert client.post("/transcode", files=EMPTY_VIDEO, headers=subscriber).status_code == 400


def test_canceled_subscription_loses_access(client, subscriber):
    set_subscription("sub@molko.dev", "canceled")
    assert client.post("/transcode", files=EMPTY_VIDEO, headers=subscriber).status_code == 402


@pytest.fixture
def fake_youtube(monkeypatch):
    state = types.SimpleNamespace(duration=120.0, job_status="running")

    async def fake_probe(url):
        return state.duration

    def fake_start_job(*args):
        return uuid.uuid4().hex

    def fake_get_status(job_id):
        return types.SimpleNamespace(
            status=state.job_status, progress=0.5, error="boom", error_code="ytdlp_no_output", title=None
        )

    monkeypatch.setattr(youtube_routes, "probe_duration_seconds", fake_probe)
    monkeypatch.setattr(youtube_routes, "start_job", fake_start_job)
    monkeypatch.setattr(youtube_routes, "get_status", fake_get_status)
    return state


def start(client, headers, **overrides):
    return client.post("/youtube", json={"url": YT_URL, **overrides}, headers=headers)


def used(client, headers) -> int:
    return client.get("/auth/me", headers=headers).json()["youtube"]["used"]


def test_youtube_feature_flag_turns_it_off(client, subscriber, fake_youtube, monkeypatch):
    monkeypatch.setattr(settings, "youtube_enabled", False)
    assert start(client, subscriber).status_code == 503


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.com/?youtube.com",
        "http://169.254.169.254/latest/meta-data/?x=youtube.com",
        "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
        "-o /tmp/x youtube.com",
        "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
        "http://127.0.0.1:8000\\@www.youtube.com/watch?v=dQw4w9WgXcQ",
        "http://127.0.0.1:8000\t@www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/redirect?q=http%3A%2F%2F127.0.0.1%2F",
        "https://www.youtube.com/oembed?url=http%3A%2F%2F127.0.0.1%2F",
        "https://www.youtube.com/watch?v=corto",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ extra",
    ],
)
def test_youtube_rejects_non_youtube_urls(client, subscriber, fake_youtube, url):
    assert start(client, subscriber, url=url).status_code == 400


@pytest.mark.parametrize(
    "url",
    [
        "https://youtu.be/dQw4w9WgXcQ",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        YT_URL,
    ],
)
def test_youtube_accepts_real_youtube_urls(client, subscriber, fake_youtube, url):
    assert start(client, subscriber, url=url).status_code == 200


def test_youtube_monthly_limit(client, subscriber, fake_youtube, monkeypatch):
    monkeypatch.setattr(settings, "youtube_monthly_limit", 2)
    assert start(client, subscriber).status_code == 200
    assert start(client, subscriber).status_code == 200
    assert used(client, subscriber) == 2
    blocked = start(client, subscriber)
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "youtube_monthly_limit"
    assert blocked.json()["detail"]["params"] == {"limit": 2}


def test_youtube_max_duration_and_trimming(client, subscriber, fake_youtube):
    fake_youtube.duration = 4000.0
    too_long = start(client, subscriber)
    assert too_long.status_code == 400
    assert too_long.json()["detail"] == {
        "code": "youtube_too_long",
        "message": "El video (o el recorte) dura más de 30 minutos, que es el máximo permitido",
        "params": {"minutes": 30},
    }
    trimmed = start(client, subscriber, start_time="00:10:00", end_time="00:20:00")
    assert trimmed.status_code == 200
    empty = start(client, subscriber, start_time="00:30:00", end_time="00:10:00")
    assert empty.status_code == 400


def test_youtube_jobs_belong_to_their_owner(client, subscriber, fake_youtube):
    job_id = start(client, subscriber).json()["job_id"]
    register(client, "otro@molko.dev")
    set_subscription("otro@molko.dev")
    login = client.post("/auth/login", json={"email": "otro@molko.dev", "password": "correct-horse-battery"})
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert client.get(f"/youtube/{job_id}", headers=other).status_code == 404
    assert client.get(f"/youtube/{job_id}/file", headers=other).status_code == 404
    assert client.get(f"/youtube/{job_id}", headers=subscriber).status_code == 200


def test_failed_download_refunds_the_quota(client, subscriber, fake_youtube):
    job_id = start(client, subscriber).json()["job_id"]
    assert used(client, subscriber) == 1
    fake_youtube.job_status = "error"
    failed = client.get(f"/youtube/{job_id}", headers=subscriber).json()
    assert failed["status"] == "error"
    assert failed["error_code"] == "ytdlp_no_output"
    assert used(client, subscriber) == 0
