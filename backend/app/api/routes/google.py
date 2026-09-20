import hmac
import logging
import secrets
from typing import Literal
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.routes.auth import normalize_email, signups_open
from app.core.config import settings
from app.core.errors import api_error
from app.core.rate_limit import rate_limit
from app.core.security import create_access_token, hash_password
from app.db.base import get_db, utcnow
from app.models.user import Subscription, User
from app.schemas.auth import TokenResponse, clean_name
from app.schemas.google import GoogleSessionRequest
from app.services import google_service
from app.services.google_service import GoogleAuthError

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/auth/google", tags=["auth"])

OAUTH_COOKIE = "molko_oauth"
OAUTH_COOKIE_PATH = "/auth/google"
OAUTH_COOKIE_MAX_AGE = 600

start_limit = rate_limit("google-start", limit=20, window_seconds=3600)
callback_limit = rate_limit("google-callback", limit=60, window_seconds=3600)
session_limit = rate_limit("google-session", limit=60, window_seconds=3600)


def frontend_redirect(path: str, **params: str) -> RedirectResponse:
    # Always to a fixed path on the configured frontend, never to a caller-supplied URL.
    query = f"?{urlencode(params)}" if params else ""
    return RedirectResponse(f"{settings.frontend_url}{path}{query}", status_code=status.HTTP_302_FOUND)


def failure(reason: str, path: str = "/login") -> RedirectResponse:
    response = frontend_redirect(path, google_error=reason)
    response.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
    return response


class FlowError(Exception):
    def __init__(self, reason: str, path: str = "/login"):
        super().__init__(reason)
        self.reason = reason
        self.path = path


def _find_or_create_user(db: Session, claims: dict, state: dict) -> User:
    subject = claims["sub"]
    email = normalize_email(claims["email"])

    user = db.query(User).filter(User.google_sub == subject).first()
    if user is not None:
        return user

    user = db.query(User).filter(User.email == email).first()
    if user is not None:
        if user.google_sub and user.google_sub != subject:
            raise FlowError("account_conflict")
        if user.email_verified_at is None:
            # Pre-hijacking: someone may have registered this address with a password they
            # know before its owner ever signed in. Now that Google proves the owner, the old
            # password and every session issued so far are revoked.
            user.hashed_password = hash_password(secrets.token_urlsafe(32))
            user.token_version += 1
            user.email_verified_at = utcnow()
        user.google_sub = subject
        if not user.name:
            user.name = _name_from(claims)
        db.commit()
        return user

    if not state.get("terms"):
        raise FlowError("terms_required")
    if not signups_open(db):
        raise FlowError("signups_closed", "/register")

    user = User(
        email=email,
        # A password nobody knows: this account signs in with Google.
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        name=_name_from(claims),
        language=state.get("lang", "es"),
        google_sub=subject,
        email_verified_at=utcnow(),
        terms_accepted_at=utcnow(),
        terms_version=settings.terms_version,
    )
    db.add(user)
    try:
        db.flush()
        db.add(Subscription(user_id=user.id, status="inactive"))
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(User).filter((User.google_sub == subject) | (User.email == email)).first()
        if existing is None:
            raise FlowError("failed")
        return existing
    return user


def _name_from(claims: dict) -> str | None:
    for key in ("given_name", "name"):
        value = claims.get(key)
        if isinstance(value, str):
            try:
                cleaned = clean_name(value)
            except ValueError:
                continue
            if cleaned:
                return cleaned
    return None


@router.get("/start", dependencies=[Depends(start_limit)])
def start(language: Literal["es", "en"] = "es", terms: bool = False):
    if not google_service.is_enabled():
        return failure("disabled")

    csrf, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    state = google_service.build_state(csrf=csrf, nonce=nonce, language=language, terms=terms)
    response = RedirectResponse(
        google_service.authorization_url(state=state, nonce=nonce), status_code=status.HTTP_302_FOUND
    )
    # Binds the flow to this browser: a callback URL forged for someone else's browser
    # arrives without this cookie and is rejected (login CSRF).
    response.set_cookie(
        OAUTH_COOKIE,
        csrf,
        max_age=OAUTH_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=urlparse(settings.backend_url).scheme == "https",
        path=OAUTH_COOKIE_PATH,
    )
    return response


@router.get("/callback", dependencies=[Depends(callback_limit)])
def callback(
    request: Request,
    db: Session = Depends(get_db),
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if not google_service.is_enabled():
        return failure("disabled")

    payload = google_service.read_state(state or "")
    cookie = request.cookies.get(OAUTH_COOKIE)
    if payload is None or not cookie or not hmac.compare_digest(cookie, payload["csrf"]):
        return failure("invalid_state")
    if error:
        return failure("cancelled")
    if not code:
        return failure("failed")

    try:
        claims = google_service.verify_id_token(google_service.exchange_code(code), payload["nonce"])
        user = _find_or_create_user(db, claims, payload)
    except GoogleAuthError as exc:
        return failure(exc.reason)
    except FlowError as exc:
        return failure(exc.reason, exc.path)

    response = frontend_redirect("/auth/google/done", code=google_service.issue_session_code(user.id))
    response.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
    return response


@router.post("/session", response_model=TokenResponse, dependencies=[Depends(session_limit)])
def session(payload: GoogleSessionRequest, db: Session = Depends(get_db)):
    user_id = google_service.redeem_session_code(payload.code)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise api_error(status.HTTP_400_BAD_REQUEST, "invalid_google_session", "La sesión de Google venció, inténtalo de nuevo")
    return TokenResponse(access_token=create_access_token(user.id, user.token_version))
