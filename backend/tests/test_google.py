import time
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import settings
from app.db.base import SessionLocal
from app.models.user import User
from app.services import google_service
from app.services.google_service import GoogleAuthError
from tests.conftest import PASSWORD, register

CLIENT_ID = "test-client.apps.googleusercontent.com"
ISSUER = "https://accounts.google.com"

PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def make_token(nonce: str, key=PRIVATE_KEY, algorithm="RS256", **overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": CLIENT_ID,
        "sub": "google-sub-1",
        "email": "gael@gmail.com",
        "email_verified": True,
        "given_name": "Gael",
        "name": "Gael Perez",
        "iat": now,
        "exp": now + 3600,
        "nonce": nonce,
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=algorithm, headers={"kid": "test"})


@pytest.fixture(autouse=True)
def google_configured(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", CLIENT_ID)
    monkeypatch.setattr(settings, "google_client_secret", "secret")
    monkeypatch.setattr(google_service, "_signing_key", lambda token: PRIVATE_KEY.public_key())


@pytest.fixture
def google_returns(monkeypatch):
    """Lets each test decide which ID token 'Google' hands back for the authorization code."""
    holder = {"token": None, "calls": []}

    def fake_exchange(code):
        holder["calls"].append(code)
        return holder["token"]

    monkeypatch.setattr(google_service, "exchange_code", fake_exchange)
    return holder


def begin(client, language="es", terms=True):
    res = client.get("/auth/google/start", params={"language": language, "terms": terms}, follow_redirects=False)
    assert res.status_code == 302
    query = parse_qs(urlparse(res.headers["location"]).query)
    return res, query["state"][0], query["nonce"][0]


def finish(client, state, google_returns, token, code="auth-code"):
    google_returns["token"] = token
    return client.get("/auth/google/callback", params={"code": code, "state": state}, follow_redirects=False)


def location_of(res) -> tuple[str, dict]:
    parsed = urlparse(res.headers["location"])
    assert res.headers["location"].startswith(settings.frontend_url + "/"), "redirect fuera del frontend"
    return parsed.path, {k: v[0] for k, v in parse_qs(parsed.query).items()}


def sign_in(client, google_returns, **overrides):
    _, state, nonce = begin(client, **{k: overrides.pop(k) for k in ("language", "terms") if k in overrides})
    res = finish(client, state, google_returns, make_token(nonce, **overrides))
    path, params = location_of(res)
    return path, params


def redeem(client, code):
    res = client.post("/auth/google/session", json={"code": code})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def users() -> list[User]:
    db = SessionLocal()
    try:
        rows = db.query(User).all()
        for row in rows:
            db.expunge(row)
        return rows
    finally:
        db.close()


# ------------------------------------------------------------------ inicio del flujo


def test_start_redirects_to_google_with_the_expected_parameters(client):
    res, state, nonce = begin(client, language="en")
    parsed = urlparse(res.headers["location"])
    query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == settings.google_auth_url
    assert query["client_id"] == CLIENT_ID
    assert query["redirect_uri"] == f"{settings.backend_url}/auth/google/callback"
    assert query["response_type"] == "code"
    assert query["scope"] == "openid email profile"
    assert state and nonce
    cookie = res.headers["set-cookie"]
    assert "molko_oauth=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "Path=/auth/google" in cookie


def test_start_when_google_is_not_configured_goes_back_to_login(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "")
    res = client.get("/auth/google/start", follow_redirects=False)
    assert location_of(res) == ("/login", {"google_error": "disabled"})


def test_config_reports_whether_google_is_available(client, monkeypatch):
    assert client.get("/auth/config").json()["google_enabled"] is True
    monkeypatch.setattr(settings, "google_client_secret", "")
    assert client.get("/auth/config").json()["google_enabled"] is False


# ------------------------------------------------------------------ cuenta nueva y sesión


def test_new_google_user_is_created_verified_with_name_language_and_terms(client, google_returns):
    path, params = sign_in(client, google_returns, language="en")
    assert path == "/auth/google/done"
    headers = redeem(client, params["code"])

    me = client.get("/auth/me", headers=headers).json()
    assert me["email"] == "gael@gmail.com"
    assert me["name"] == "Gael"
    assert me["terms_accepted"] is True
    assert me["subscription"]["is_active"] is False
    (user,) = users()
    assert user.language == "en"
    assert user.google_sub == "google-sub-1"


def test_signing_in_again_reuses_the_same_account(client, google_returns):
    first = redeem(client, sign_in(client, google_returns)[1]["code"])
    second = redeem(client, sign_in(client, google_returns, terms=False)[1]["code"])  # ya no necesita términos
    assert client.get("/auth/me", headers=first).json()["id"] == client.get("/auth/me", headers=second).json()["id"]
    assert len(users()) == 1


def test_a_google_only_account_cannot_be_opened_with_a_password(client, google_returns):
    sign_in(client, google_returns)
    res = client.post("/auth/login", json={"email": "gael@gmail.com", "password": PASSWORD})
    assert res.status_code == 401


def test_the_session_code_works_once_and_expires(client, google_returns, monkeypatch):
    code = sign_in(client, google_returns)[1]["code"]
    assert client.post("/auth/google/session", json={"code": code}).status_code == 200
    assert client.post("/auth/google/session", json={"code": code}).status_code == 400

    code = sign_in(client, google_returns)[1]["code"]
    monkeypatch.setattr(time, "monotonic", lambda: time.time() + 3600)
    res = client.post("/auth/google/session", json={"code": code})
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "invalid_google_session"
    assert client.post("/auth/google/session", json={"code": "inventado"}).status_code == 400


def test_the_session_token_never_travels_in_the_redirect_url(client, google_returns):
    res_location = None
    _, state, nonce = begin(client)
    res = finish(client, state, google_returns, make_token(nonce))
    res_location = res.headers["location"]
    assert "eyJ" not in res_location  # ningún JWT en la URL: solo un código de un uso


# ------------------------------------------------------------------ cuentas existentes


def test_a_verified_password_account_is_linked_and_keeps_its_password(client, google_returns):
    register(client, "gael@gmail.com", confirmed=True)
    path, params = sign_in(client, google_returns)
    assert path == "/auth/google/done"
    assert len(users()) == 1
    assert users()[0].google_sub == "google-sub-1"
    assert client.post("/auth/login", json={"email": "gael@gmail.com", "password": PASSWORD}).status_code == 200


def test_pre_hijacking_an_unverified_account_loses_the_attackers_password_and_sessions(client, google_returns):
    # Alguien registra el correo de la víctima con una contraseña que solo él conoce...
    attacker_headers = register(client, "gael@gmail.com", confirmed=False)
    assert client.get("/auth/me", headers=attacker_headers).status_code == 200

    # ...y luego la dueña entra con Google.
    _, params = sign_in(client, google_returns)
    victim_headers = redeem(client, params["code"])

    assert client.post("/auth/login", json={"email": "gael@gmail.com", "password": PASSWORD}).status_code == 401
    assert client.get("/auth/me", headers=attacker_headers).status_code == 401, "la sesión del atacante debe morir"
    me = client.get("/auth/me", headers=victim_headers).json()
    assert users()[0].email_verified_at is not None
    assert len(users()) == 1


def test_an_email_linked_to_another_google_account_is_refused(client, google_returns):
    sign_in(client, google_returns)
    _, state, nonce = begin(client)
    res = finish(client, state, google_returns, make_token(nonce, sub="google-sub-DISTINTO"))
    assert location_of(res) == ("/login", {"google_error": "account_conflict"})


# ------------------------------------------------------------------ registro nuevo con condiciones


def test_a_new_account_needs_the_terms_to_be_accepted(client, google_returns):
    assert sign_in(client, google_returns, terms=False) == ("/login", {"google_error": "terms_required"})
    assert users() == []


def test_a_new_account_respects_the_signup_cap(client, google_returns, monkeypatch):
    register(client, "otra@molko.dev", confirmed=True)
    monkeypatch.setattr(settings, "max_users", 1)
    assert sign_in(client, google_returns) == ("/register", {"google_error": "signups_closed"})
    assert len(users()) == 1


# ------------------------------------------------------------------ CSRF y estado


def test_a_callback_without_the_browser_cookie_is_rejected(client, google_returns):
    # Login CSRF: el atacante inicia su flujo y le manda a la víctima su URL de retorno.
    _, state, nonce = begin(client)
    from fastapi.testclient import TestClient

    from app.main import app

    victim_browser = TestClient(app)  # sin la cookie del atacante
    google_returns["token"] = make_token(nonce)
    res = victim_browser.get("/auth/google/callback", params={"code": "x", "state": state}, follow_redirects=False)
    assert location_of(res) == ("/login", {"google_error": "invalid_state"})
    assert users() == []


@pytest.mark.parametrize("mutate", [lambda s: s + "x", lambda s: s[:-3], lambda s: "", lambda s: "basura"])
def test_tampered_or_missing_state_is_rejected(client, google_returns, mutate):
    _, state, nonce = begin(client)
    res = finish(client, mutate(state), google_returns, make_token(nonce))
    assert location_of(res) == ("/login", {"google_error": "invalid_state"})


def test_an_expired_state_is_rejected(client, google_returns, monkeypatch):
    monkeypatch.setattr(google_service, "STATE_TTL", timedelta(seconds=-5))
    _, state, nonce = begin(client)
    res = finish(client, state, google_returns, make_token(nonce))
    assert location_of(res) == ("/login", {"google_error": "invalid_state"})


def test_the_user_cancelling_at_google_is_reported(client):
    _, state, _ = begin(client)
    res = client.get("/auth/google/callback", params={"error": "access_denied", "state": state}, follow_redirects=False)
    assert location_of(res) == ("/login", {"google_error": "cancelled"})


def test_a_callback_without_a_code_fails_cleanly(client):
    _, state, _ = begin(client)
    res = client.get("/auth/google/callback", params={"state": state}, follow_redirects=False)
    assert location_of(res) == ("/login", {"google_error": "failed"})


def test_a_failed_code_exchange_is_reported_without_details(client, monkeypatch):
    def broken(code):
        raise GoogleAuthError("failed")

    monkeypatch.setattr(google_service, "exchange_code", broken)
    _, state, _ = begin(client)
    res = client.get("/auth/google/callback", params={"code": "x", "state": state}, follow_redirects=False)
    assert location_of(res) == ("/login", {"google_error": "failed"})


# ------------------------------------------------------------------ verificación del ID token


def rejected(**kwargs) -> str:
    token = kwargs.pop("token", None) or make_token(kwargs.pop("nonce", "n0nce"), **kwargs)
    with pytest.raises(GoogleAuthError) as caught:
        google_service.verify_id_token(token, "n0nce")
    return caught.value.reason


def test_a_good_id_token_is_accepted():
    claims = google_service.verify_id_token(make_token("n0nce"), "n0nce")
    assert claims["email"] == "gael@gmail.com"


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "otro-cliente"},
        {"iss": "https://evil.example"},
        {"exp": int(time.time()) - 10},
        {"nonce": "otro-nonce"},
        {"nonce": None},
        {"sub": None},
        {"email": None},
        {"email": ""},
        {"iat": None},
    ],
)
def test_id_tokens_with_wrong_claims_are_rejected(overrides):
    assert rejected(**overrides) == "failed"


@pytest.mark.parametrize("value", [False, None, "false", 0])
def test_an_unverified_google_email_is_rejected(value):
    assert rejected(email_verified=value) == "email_unverified"


def test_forged_and_downgraded_id_tokens_are_rejected():
    assert rejected(key=OTHER_KEY) == "failed"  # firmado con otra llave

    public_pem = PRIVATE_KEY.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    confusion = jwt.encode(
        {"iss": ISSUER, "aud": CLIENT_ID, "sub": "x", "email": "a@b.c", "email_verified": True, "nonce": "n0nce",
         "iat": int(time.time()), "exp": int(time.time()) + 600},
        public_pem, algorithm="HS256",
    ) if False else None  # PyJWT ya se niega a firmar HS256 con una llave PEM; se prueba el token a mano abajo
    assert confusion is None

    import base64, hashlib, hmac as hmac_module, json

    def b64(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64(json.dumps({"iss": ISSUER, "aud": CLIENT_ID, "sub": "x", "email": "a@b.c", "email_verified": True,
                              "nonce": "n0nce", "iat": int(time.time()), "exp": int(time.time()) + 600}).encode())
    signature = b64(hmac_module.new(public_pem, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    assert rejected(token=f"{header}.{payload}.{signature}") == "failed"  # confusión de algoritmo RS256 -> HS256

    none_token = f"{b64(json.dumps({'alg': 'none', 'typ': 'JWT'}).encode())}.{payload}."
    assert rejected(token=none_token) == "failed"

    good = make_token("n0nce")
    head, body, sig = good.split(".")
    tampered_body = b64(json.dumps({**json.loads(base64.urlsafe_b64decode(body + "==")), "email": "otra@persona.com"}).encode())
    assert rejected(token=f"{head}.{tampered_body}.{sig}") == "failed"


def test_an_unverified_email_never_creates_an_account(client, google_returns):
    _, state, nonce = begin(client)
    res = finish(client, state, google_returns, make_token(nonce, email_verified=False))
    assert location_of(res) == ("/login", {"google_error": "email_unverified"})
    assert users() == []
