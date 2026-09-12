from datetime import datetime, timezone

import stripe
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import Subscription, User

stripe.api_key = settings.stripe_secret_key

PRICE_TO_PLAN = {
    settings.stripe_price_id_monthly: "monthly",
    settings.stripe_price_id_annual: "annual",
}
PLAN_TO_PRICE = {
    "monthly": settings.stripe_price_id_monthly,
    "annual": settings.stripe_price_id_annual,
}


def get_or_create_customer(db: Session, user: User) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id

    customer = stripe.Customer.create(email=user.email, metadata={"user_id": str(user.id)})
    user.stripe_customer_id = customer["id"]
    db.commit()
    return customer["id"]


def create_checkout_session(db: Session, user: User, plan: str) -> str:
    customer_id = get_or_create_customer(db, user)
    price_id = PLAN_TO_PRICE[plan]

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{settings.frontend_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.frontend_url}/billing/cancel",
        metadata={"user_id": str(user.id), "plan": plan},
    )
    return session["url"]


def create_portal_session(db: Session, user: User) -> str:
    customer_id = get_or_create_customer(db, user)
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{settings.frontend_url}/dashboard",
    )
    return session["url"]


def construct_webhook_event(payload: bytes, sig_header: str):
    return stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)


def _upsert_subscription_from_stripe(db: Session, user: User, stripe_sub: dict) -> None:
    price_id = stripe_sub["items"]["data"][0]["price"]["id"]
    plan = PRICE_TO_PLAN.get(price_id)
    period_end = datetime.fromtimestamp(stripe_sub["current_period_end"], tz=timezone.utc)

    sub = user.subscription
    if sub is None:
        sub = Subscription(user_id=user.id)
        db.add(sub)

    sub.stripe_subscription_id = stripe_sub["id"]
    sub.plan = plan
    sub.status = stripe_sub["status"]
    sub.current_period_end = period_end
    db.commit()


def handle_checkout_session_completed(db: Session, session: dict) -> None:
    user_id = int(session["metadata"]["user_id"])
    user = db.get(User, user_id)
    if user is None:
        return

    stripe_sub = stripe.Subscription.retrieve(session["subscription"])
    _upsert_subscription_from_stripe(db, user, stripe_sub)


def handle_subscription_updated(db: Session, stripe_sub: dict) -> None:
    user = db.query(User).filter(User.stripe_customer_id == stripe_sub["customer"]).first()
    if user is None:
        return
    _upsert_subscription_from_stripe(db, user, stripe_sub)


def handle_subscription_deleted(db: Session, stripe_sub: dict) -> None:
    user = db.query(User).filter(User.stripe_customer_id == stripe_sub["customer"]).first()
    if user is None or user.subscription is None:
        return
    user.subscription.status = "canceled"
    db.commit()
