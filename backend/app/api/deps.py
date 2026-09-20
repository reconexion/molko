from fastapi import Depends, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.core.rate_limit import allow, too_many_requests
from app.core.security import decode_access_token
from app.db.base import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = api_error(
        status.HTTP_401_UNAUTHORIZED,
        "session_invalid",
        "No se pudo validar la sesión",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_error

    decoded = decode_access_token(token)
    if decoded is None:
        raise credentials_error

    user_id, token_version = decoded
    user = db.get(User, user_id)
    # token_version is bumped on logout, which is what revokes every earlier token.
    if user is None or user.token_version != token_version:
        raise credentials_error

    return user


def require_active_subscription(user: User = Depends(get_current_user)) -> User:
    if user.subscription is None or not user.subscription.is_active:
        raise api_error(
            status.HTTP_402_PAYMENT_REQUIRED,
            "subscription_required",
            "Se requiere una suscripción activa para usar esta función",
        )
    return user


def user_rate_limit(scope: str, limit: int, window_seconds: int):
    """Per-account limit, for endpoints that cost real resources or money."""

    def dependency(user: User = Depends(get_current_user)) -> None:
        if not allow(f"user:{scope}:{user.id}", limit, window_seconds):
            raise too_many_requests()

    return dependency
