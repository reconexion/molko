from fastapi import APIRouter, Depends, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, user_rate_limit
from app.core.config import settings
from app.core.errors import api_error
from app.core.rate_limit import (
    clear_login_failures,
    login_blocked,
    rate_limit,
    record_login_failure,
    too_many_requests,
)
from app.core.security import (
    burn_password_check,
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.base import get_db, utcnow
from app.models.user import Subscription, User
from app.schemas.auth import (
    AuthConfigResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
    YoutubeUsage,
)
from app.services import google_service
from app.services.usage_service import youtube_downloads_this_month

router = APIRouter(prefix="/auth", tags=["auth"])

auth_rate_limit = rate_limit("auth", limit=10, window_seconds=300)
profile_rate_limit = user_rate_limit("profile", limit=30, window_seconds=3600)

# Per account, across all IPs (see login_blocked).
LOGIN_FAILURE_LIMIT = 10
LOGIN_FAILURE_WINDOW_SECONDS = 900


def normalize_email(email: str) -> str:
    return email.strip().lower()


def signups_open(db: Session) -> bool:
    if settings.max_users <= 0:
        return True
    return (db.query(func.count(User.id)).scalar() or 0) < settings.max_users


@router.get("/config", response_model=AuthConfigResponse)
def auth_config(db: Session = Depends(get_db)):
    return AuthConfigResponse(signups_open=signups_open(db), google_enabled=google_service.is_enabled())


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(auth_rate_limit)],
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    # Consent is enforced here, not only by the form's checkbox, so it can't be skipped by
    # calling the API directly.
    if not payload.accept_terms:
        raise api_error(
            status.HTTP_400_BAD_REQUEST, "terms_not_accepted", "Debes aceptar los términos y condiciones"
        )
    email = normalize_email(payload.email)
    if db.query(User).filter(User.email == email).first() is not None:
        raise api_error(status.HTTP_409_CONFLICT, "email_taken", "El correo ya está registrado")
    if not signups_open(db):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "signups_closed",
            "El registro está cerrado por ahora. Únete a la lista de espera.",
        )

    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        name=payload.name,
        terms_accepted_at=utcnow(),
        terms_version=settings.terms_version,
        language=payload.language,
    )
    db.add(user)
    try:
        db.flush()
        db.add(Subscription(user_id=user.id, status="inactive"))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise api_error(status.HTTP_409_CONFLICT, "email_taken", "El correo ya está registrado")
    db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id, user.token_version))


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(auth_rate_limit)])
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    if login_blocked(email, LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_SECONDS):
        raise too_many_requests()

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        burn_password_check(payload.password)
    if user is None or not verify_password(payload.password, user.hashed_password):
        record_login_failure(email)
        raise api_error(status.HTTP_401_UNAUTHORIZED, "invalid_credentials", "Correo o contraseña incorrectos")

    clear_login_failures(email)
    return TokenResponse(access_token=create_access_token(user.id, user.token_version))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Revoca todas las sesiones de la cuenta: los tokens emitidos antes dejan de valer."""
    current_user.token_version += 1
    db.commit()


def user_response(user: User, db: Session) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        terms_accepted=user.terms_version == settings.terms_version,
        subscription=user.subscription,
        youtube=YoutubeUsage(
            enabled=settings.youtube_enabled,
            used=youtube_downloads_this_month(db, user.id),
            limit=settings.youtube_monthly_limit,
        ),
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_response(current_user, db)


@router.patch("/me", response_model=UserResponse, dependencies=[Depends(profile_rate_limit)])
def update_profile(
    payload: UpdateProfileRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    current_user.name = payload.name
    db.commit()
    return user_response(current_user, db)


@router.post("/accept-terms", response_model=UserResponse, dependencies=[Depends(profile_rate_limit)])
def accept_terms(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """For accounts created under an older version of the terms."""
    current_user.terms_version = settings.terms_version
    current_user.terms_accepted_at = utcnow()
    db.commit()
    return user_response(current_user, db)
