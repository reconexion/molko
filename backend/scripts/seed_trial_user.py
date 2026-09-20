"""Crea (o actualiza) un usuario con una suscripción activa otorgada a mano, para
poder entrar al editor sin pasar por un cobro real de Stripe. Sirve para el
fundador durante la fase de un solo usuario y para pruebas locales.

La suscripción no está ligada a Stripe: current_period_end es solo una fecha
N días adelante y nada la renueva ni la expira sola.

Uso:
    cd backend && .venv/bin/python -m scripts.seed_trial_user correo@ejemplo.com [contraseña] [días]

Si no pasas contraseña se genera una aleatoria y se imprime una sola vez.
"""

import secrets
import sys
from datetime import timedelta

sys.path.insert(0, ".")

from app import models  # noqa: E402,F401
from app.core.security import hash_password  # noqa: E402
from app.db.base import Base, SessionLocal, engine, utcnow  # noqa: E402
from app.models.user import Subscription, User  # noqa: E402

DEFAULT_DAYS = 30


def seed(email: str, password: str | None, days: int) -> None:
    Base.metadata.create_all(bind=engine)
    email = email.strip().lower()
    generated = password is None
    password = password or secrets.token_urlsafe(12)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        password_saved = True
        if user is None:
            user = User(email=email, hashed_password=hash_password(password), email_verified_at=utcnow())
            db.add(user)
            db.flush()
        elif generated:
            password_saved = False
            print(f"{email} ya existe: se conserva su contraseña actual.")
        else:
            user.hashed_password = hash_password(password)

        if user.email_verified_at is None:
            user.email_verified_at = utcnow()
        period_end = utcnow() + timedelta(days=days)
        if user.subscription is None:
            db.add(Subscription(user_id=user.id, plan="monthly", status="active", current_period_end=period_end))
        else:
            user.subscription.plan = "monthly"
            user.subscription.status = "active"
            user.subscription.current_period_end = period_end

        db.commit()
        print(f"Usuario listo: {email}")
        if generated and password_saved:
            print(f"Contraseña (solo se muestra ahora): {password}")
        print(f"Suscripción activa hasta {period_end.date().isoformat()}")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    seed(
        sys.argv[1],
        sys.argv[2] if len(sys.argv) > 2 else None,
        int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_DAYS,
    )
