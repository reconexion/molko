import os
import tempfile

# Deben fijarse antes de importar la app: Settings se instancia al importar y las
# variables de entorno tienen prioridad sobre backend/.env.
_TMP_DIR = tempfile.mkdtemp(prefix="molko-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DIR}/test.db"
os.environ["JWT_SECRET"] = "test-secret-not-for-production-0123456789"
os.environ["STRIPE_SECRET_KEY"] = "sk_test_dummy"
os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_test"
os.environ["STRIPE_PRICE_ID_MONTHLY"] = "price_monthly"
os.environ["STRIPE_PRICE_ID_ANNUAL"] = "price_annual"
os.environ["MAX_USERS"] = "0"
os.environ["YOUTUBE_ENABLED"] = "true"
os.environ["YOUTUBE_MONTHLY_LIMIT"] = "20"
os.environ["YOUTUBE_MAX_DURATION_SECONDS"] = "1800"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.rate_limit import reset_rate_limits  # noqa: E402
from app.db.base import Base, SessionLocal, engine, utcnow  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import Subscription, User  # noqa: E402

PASSWORD = "correct-horse-battery"


@pytest.fixture(autouse=True)
def clean_state():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    reset_rate_limits()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def mark_email_confirmed(email: str) -> None:
    db = SessionLocal()
    try:
        db.query(User).filter(User.email == email.strip().lower()).one().email_verified_at = utcnow()
        db.commit()
    finally:
        db.close()


def register(
    client: TestClient, email: str = "ana@molko.dev", password: str = PASSWORD, confirmed: bool = True
) -> dict[str, str]:
    res = client.post("/auth/register", json={"email": email, "password": password, "accept_terms": True})
    assert res.status_code == 201, res.text
    if confirmed:
        mark_email_confirmed(email)
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def set_subscription(email: str, status: str = "active", customer_id: str | None = None) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one()
        if customer_id:
            user.stripe_customer_id = customer_id
        user.subscription.status = status
        user.subscription.plan = "monthly"
        user.subscription.current_period_end = utcnow()
        db.commit()
    finally:
        db.close()


@pytest.fixture
def subscriber(client):
    headers = register(client, "sub@molko.dev")
    set_subscription("sub@molko.dev")
    return headers


__all__ = ["Subscription", "register", "set_subscription"]
