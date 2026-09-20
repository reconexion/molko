import hmac
import logging
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from jwt import PyJWKClient

from app.core.config import settings

logger = logging.getLogger("uvicorn.error")

STATE_AUDIENCE = "molko:google-state"
STATE_TTL = timedelta(minutes=10)
HTTP_TIMEOUT_SECONDS = 10

# Un código de un solo uso que el frontend cambia por la sesión: así el token de sesión
# nunca aparece en una URL (historial del navegador, cabeceras Referer, registros).
SESSION_CODE_TTL_SECONDS = 60
_MAX_PENDING_SESSIONS = 10_000
_sessions: dict[str, tuple[int, float]] = {}
_sessions_lock = threading.Lock()


class GoogleAuthError(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def is_enabled() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def redirect_uri() -> str:
    return f"{settings.backend_url}/auth/google/callback"


def build_state(*, csrf: str, nonce: str, language: str, terms: bool) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "csrf": csrf,
        "nonce": nonce,
        "lang": language,
        "terms": terms,
        "aud": STATE_AUDIENCE,
        "exp": now + STATE_TTL,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def read_state(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=STATE_AUDIENCE,
            options={"require": ["exp", "aud", "csrf", "nonce"]},
        )
    except jwt.PyJWTError:
        return None


def authorization_url(*, state: str, nonce: str) -> str:
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": redirect_uri(),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "prompt": "select_account",
        }
    )
    return f"{settings.google_auth_url}?{query}"


def exchange_code(code: str) -> str:
    """Trades the authorization code for the ID token (server to server, with the client secret)."""
    try:
        response = httpx.post(
            settings.google_token_url,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri(),
                "grant_type": "authorization_code",
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        logger.warning("Google: no se pudo canjear el código: %s", exc)
        raise GoogleAuthError("failed") from exc
    if response.status_code != 200:
        logger.warning("Google rechazó el código (HTTP %s)", response.status_code)
        raise GoogleAuthError("failed")
    id_token = response.json().get("id_token")
    if not isinstance(id_token, str) or not id_token:
        raise GoogleAuthError("failed")
    return id_token


_jwk_clients: dict[str, PyJWKClient] = {}


def _signing_key(id_token: str):
    url = settings.google_jwks_url
    client = _jwk_clients.setdefault(url, PyJWKClient(url, timeout=HTTP_TIMEOUT_SECONDS))
    return client.get_signing_key_from_jwt(id_token).key


def verify_id_token(id_token: str, nonce: str) -> dict:
    """Checks signature (RS256 pinned), audience, issuer, expiry, nonce and that Google verified the email."""
    try:
        claims = jwt.decode(
            id_token,
            _signing_key(id_token),
            algorithms=["RS256"],
            audience=settings.google_client_id,
            issuer=settings.google_issuers,
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except (jwt.PyJWTError, httpx.HTTPError, OSError) as exc:
        logger.warning("Google: ID token inválido: %s", exc)
        raise GoogleAuthError("failed") from exc

    if not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
        raise GoogleAuthError("failed")
    email, subject = claims.get("email"), claims.get("sub")
    if not isinstance(email, str) or not email or not isinstance(subject, str) or not subject:
        raise GoogleAuthError("failed")
    # Sin esto, cualquiera podría crear una cuenta de Google con el correo de otra persona.
    if claims.get("email_verified") not in (True, "true"):
        raise GoogleAuthError("email_unverified")
    return claims


def issue_session_code(user_id: int) -> str:
    code = secrets.token_urlsafe(32)
    now = time.monotonic()
    with _sessions_lock:
        for key in [k for k, (_, expires) in _sessions.items() if expires < now]:
            del _sessions[key]
        if len(_sessions) >= _MAX_PENDING_SESSIONS:
            _sessions.pop(next(iter(_sessions)))
        _sessions[code] = (user_id, now + SESSION_CODE_TTL_SECONDS)
    return code


def redeem_session_code(code: str) -> int | None:
    with _sessions_lock:
        entry = _sessions.pop(code, None)
    if entry is None or entry[1] < time.monotonic():
        return None
    return entry[0]
