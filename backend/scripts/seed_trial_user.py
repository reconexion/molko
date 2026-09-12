"""Creates (or updates) a user with a manually-granted active subscription,
so you can log in and use the paywalled editor without going through a real
Stripe checkout. Not tied to Stripe at all — current_period_end is just a
date 30 days out; nothing will auto-renew or auto-expire it.

Usage:
    cd backend && .venv/bin/python -m scripts.seed_trial_user [email] [password]

Defaults to demo@molko.dev / molko-demo-2026 if no args are given.
"""

import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from app.core.security import hash_password  # noqa: E402
from app.db.base import Base, SessionLocal, engine  # noqa: E402
from app.models.user import Subscription, User  # noqa: E402

DEFAULT_EMAIL = "demo@molko.dev"
DEFAULT_PASSWORD = "molko-demo-2026"
TRIAL_DAYS = 30


def seed(email: str, password: str) -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(email=email, hashed_password=hash_password(password))
            db.add(user)
            db.flush()
        else:
            user.hashed_password = hash_password(password)

        period_end = datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)

        if user.subscription is None:
            db.add(
                Subscription(
                    user_id=user.id,
                    plan="monthly",
                    status="active",
                    current_period_end=period_end,
                )
            )
        else:
            user.subscription.plan = "monthly"
            user.subscription.status = "active"
            user.subscription.current_period_end = period_end

        db.commit()
        print(f"Usuario de prueba listo: {email} / {password}")
        print(f"Suscripción activa (plan mensual) hasta {period_end.date().isoformat()}")
    finally:
        db.close()


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_EMAIL
    password = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PASSWORD
    seed(email, password)
