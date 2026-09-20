from datetime import datetime, timezone

import stripe
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import Subscription, User


class StripeNotConfiguredError(Exception):
    pass


def _configure() -> None:
    if not settings.stripe_secret_key:
        raise StripeNotConfiguredError("STRIPE_SECRET_KEY no está configurada")
    stripe.api_key = settings.stripe_secret_key


def _price_for_plan(plan: str) -> str:
    price_id = {
        "monthly": settings.stripe_price_id_monthly,
        "annual": settings.stripe_price_id_annual,
    }[plan]
    if not price_id:
        raise StripeNotConfiguredError(f"Falta el price id del plan {plan}")
    return price_id


def _plan_for_price(price_id: str | None) -> str | None:
    if price_id and price_id == settings.stripe_price_id_monthly:
        return "monthly"
    if price_id and price_id == settings.stripe_price_id_annual:
        return "annual"
    return None


def get_or_create_customer(db: Session, user: User) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id

    _configure()
    customer = stripe.Customer.create(email=user.email, metadata={"user_id": str(user.id)})
    user.stripe_customer_id = customer["id"]
    db.commit()
    return customer["id"]


def create_checkout_session(db: Session, user: User, plan: str) -> str:
    price_id = _price_for_plan(plan)
    customer_id = get_or_create_customer(db, user)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        allow_promotion_codes=True,
        success_url=f"{settings.frontend_url}/app?checkout=success",
        cancel_url=f"{settings.frontend_url}/pricing?checkout=cancel",
        client_reference_id=str(user.id),
        metadata={"user_id": str(user.id), "plan": plan},
    )
    return session["url"]


def create_portal_session(db: Session, user: User) -> str:
    customer_id = get_or_create_customer(db, user)
    session = stripe.billing_portal.Session.create(customer=customer_id, return_url=f"{settings.frontend_url}/app")
    return session["url"]


def construct_webhook_event(payload: bytes, sig_header: str):
    # Sin secreto, construct_event validaría firmas fabricadas con una llave vacía.
    if not settings.stripe_webhook_secret:
        raise StripeNotConfiguredError("STRIPE_WEBHOOK_SECRET no está configurada")
    return stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)


def _period_end(stripe_sub: dict) -> datetime | None:
    timestamp = stripe_sub.get("current_period_end")
    if timestamp is None:
        # Versiones nuevas de la API de Stripe mueven el periodo al item.
        items = (stripe_sub.get("items") or {}).get("data") or []
        timestamp = items[0].get("current_period_end") if items else None
    if timestamp is None:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).replace(tzinfo=None)


def _upsert_subscription_from_stripe(db: Session, user: User, stripe_sub: dict) -> None:
    items = (stripe_sub.get("items") or {}).get("data") or []
    price_id = items[0]["price"]["id"] if items else None

    sub = user.subscription
    if sub is None:
        sub = Subscription(user_id=user.id)
        db.add(sub)

    sub.stripe_subscription_id = stripe_sub["id"]
    sub.plan = _plan_for_price(price_id)
    sub.status = stripe_sub["status"]
    sub.current_period_end = _period_end(stripe_sub)
    db.commit()


def _user_for_customer(db: Session, customer_id: str | None) -> User | None:
    if not customer_id:
        return None
    return db.query(User).filter(User.stripe_customer_id == customer_id).first()


def handle_checkout_session_completed(db: Session, session: dict) -> None:
    user_id = (session.get("metadata") or {}).get("user_id")
    user = db.get(User, int(user_id)) if user_id and str(user_id).isdigit() else None
    if user is None or not session.get("subscription"):
        return

    if session.get("customer") and not user.stripe_customer_id:
        user.stripe_customer_id = session["customer"]

    _configure()
    stripe_sub = stripe.Subscription.retrieve(session["subscription"])
    _upsert_subscription_from_stripe(db, user, stripe_sub)


def handle_subscription_changed(db: Session, stripe_sub: dict) -> None:
    user = _user_for_customer(db, stripe_sub.get("customer"))
    if user is None:
        return
    _upsert_subscription_from_stripe(db, user, stripe_sub)


def handle_subscription_deleted(db: Session, stripe_sub: dict) -> None:
    user = _user_for_customer(db, stripe_sub.get("customer"))
    if user is None or user.subscription is None:
        return
    user.subscription.status = "canceled"
    db.commit()
