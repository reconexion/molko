from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token, hash_password
from app.db.base import get_db
from app.models.user import Subscription, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

TEST_USER_EMAIL = "test@molko.dev"


def _get_or_create_test_user(db: Session) -> User:
    user = db.query(User).filter(User.email == TEST_USER_EMAIL).first()
    if user is not None:
        return user

    user = User(email=TEST_USER_EMAIL, hashed_password=hash_password("test-mode-no-real-login"))
    db.add(user)
    db.flush()
    db.add(Subscription(user_id=user.id, status="inactive"))
    db.commit()
    db.refresh(user)
    return user


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not settings.require_auth:
        return _get_or_create_test_user(db)

    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar la sesión",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_error

    subject = decode_access_token(token)
    if subject is None:
        raise credentials_error

    user = db.get(User, int(subject))
    if user is None:
        raise credentials_error

    return user


def require_active_subscription(user: User = Depends(get_current_user)) -> User:
    if not settings.require_subscription:
        return user
    if user.subscription is None or not user.subscription.is_active:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Se requiere una suscripción activa para usar esta función",
        )
    return user
