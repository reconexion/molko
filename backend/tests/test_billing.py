import hashlib
import hmac
import json
import time

import stripe

from app.core.config import settings
from app.db.base import SessionLocal
from app.models.user import User
from tests.conftest import register, set_subscription


def signed_webhook(client, event: dict, secret: str = "whsec_test"):
    payload = json.dumps(event)
    timestamp = int(time.time())
    signature = hmac.new(secret.encode(), f"{timestamp}.{payload}".encode(), hashlib.sha256).hexdigest()
    return client.post(
        "/billing/webhook",
        content=payload,
        headers={"stripe-signature": f"t={timestamp},v1={signature}", "content-type": "application/json"},
    )


def subscription_event(event_type: str, status: str, price: str = "price_annual", customer: str = "cus_1") -> dict:
    return {
        "id": "evt_1",
        "object": "event",
        "type": event_type,
        "data": {
            "object": {
                "id": "sub_1",
                "object": "subscription",
                "customer": customer,
                "status": status,
                "current_period_end": 1893456000,
                "items": {"object": "list", "data": [{"id": "si_1", "price": {"id": price}}]},
            }
        },
    }


def me(client, headers):
    return client.get("/auth/me", headers=headers).json()["subscription"]


def test_webhook_rejects_bad_signature_and_missing_secret(client, monkeypatch):
    bad = client.post("/billing/webhook", content="{}", headers={"stripe-signature": "t=1,v1=deadbeef"})
    assert bad.status_code == 400

    monkeypatch.setattr(settings, "stripe_webhook_secret", "")
    not_configured = client.post("/billing/webhook", content="{}", headers={"stripe-signature": "t=1,v1=x"})
    assert not_configured.status_code == 503


def test_webhook_signed_with_another_secret_is_rejected(client):
    res = signed_webhook(client, subscription_event("customer.subscription.updated", "active"), secret="otro")
    assert res.status_code == 400


def test_subscription_lifecycle_through_webhooks(client):
    headers = register(client)
    set_subscription("ana@molko.dev", "inactive", customer_id="cus_1")

    assert signed_webhook(client, subscription_event("customer.subscription.created", "active")).status_code == 200
    sub = me(client, headers)
    assert sub["is_active"] is True
    assert sub["plan"] == "annual"
    assert sub["current_period_end"].startswith("2030-01-01")

    signed_webhook(client, subscription_event("customer.subscription.updated", "past_due"))
    assert me(client, headers)["is_active"] is False

    signed_webhook(client, subscription_event("customer.subscription.updated", "active", price="price_monthly"))
    assert me(client, headers)["plan"] == "monthly"

    signed_webhook(client, subscription_event("customer.subscription.deleted", "canceled"))
    assert me(client, headers)["status"] == "canceled"
    assert me(client, headers)["is_active"] is False


def test_webhook_for_unknown_customer_is_ignored(client):
    register(client)
    res = signed_webhook(client, subscription_event("customer.subscription.updated", "active", customer="cus_x"))
    assert res.status_code == 200


def test_checkout_completed_links_subscription(client, monkeypatch):
    headers = register(client)
    db = SessionLocal()
    user_id = db.query(User).one().id
    db.close()

    fake_sub = subscription_event("x", "active")["data"]["object"]
    monkeypatch.setattr(stripe.Subscription, "retrieve", lambda _id: fake_sub)

    event = {
        "id": "evt_2",
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_1",
                "object": "checkout.session",
                "customer": "cus_1",
                "subscription": "sub_1",
                "metadata": {"user_id": str(user_id)},
            }
        },
    }
    assert signed_webhook(client, event).status_code == 200
    assert me(client, headers)["is_active"] is True


def test_checkout_session_creates_customer_and_returns_url(client, monkeypatch):
    headers = register(client, confirmed=False)  # no hace falta confirmar el correo para pagar
    captured = {}
    monkeypatch.setattr(stripe.Customer, "create", lambda **kwargs: {"id": "cus_new"})

    def fake_create(**kwargs):
        captured.update(kwargs)
        return {"url": "https://checkout.stripe.test/pay"}

    monkeypatch.setattr(stripe.checkout.Session, "create", fake_create)

    res = client.post("/billing/checkout-session", json={"plan": "annual"}, headers=headers)
    assert res.status_code == 200
    assert res.json() == {"checkout_url": "https://checkout.stripe.test/pay"}
    assert captured["customer"] == "cus_new"
    assert captured["line_items"] == [{"price": "price_annual", "quantity": 1}]
    assert captured["success_url"].endswith("/app?checkout=success")
    assert captured["cancel_url"].endswith("/pricing?checkout=cancel")

    db = SessionLocal()
    try:
        assert db.query(User).one().stripe_customer_id == "cus_new"
    finally:
        db.close()


def test_checkout_requires_login_and_valid_plan(client):
    assert client.post("/billing/checkout-session", json={"plan": "monthly"}).status_code == 401
    headers = register(client)
    assert client.post("/billing/checkout-session", json={"plan": "lifetime"}, headers=headers).status_code == 422


def test_checkout_without_stripe_config_is_503(client, monkeypatch):
    headers = register(client)
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    res = client.post("/billing/checkout-session", json={"plan": "monthly"}, headers=headers)
    assert res.status_code == 503


def test_checkout_blocked_when_already_subscribed(client):
    headers = register(client)
    set_subscription("ana@molko.dev")
    res = client.post("/billing/checkout-session", json={"plan": "monthly"}, headers=headers)
    assert res.status_code == 409


def test_checkout_blocked_while_a_payment_is_pending_but_open_after_cancelling(client, monkeypatch):
    headers = register(client)
    set_subscription("ana@molko.dev", "inactive", customer_id="cus_1")
    signed_webhook(client, subscription_event("customer.subscription.created", "active"))

    signed_webhook(client, subscription_event("customer.subscription.updated", "past_due"))
    res = client.post("/billing/checkout-session", json={"plan": "monthly"}, headers=headers)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "subscription_payment_pending"

    monkeypatch.setattr(stripe.checkout.Session, "create", lambda **kwargs: {"url": "https://checkout.stripe.test/pay"})
    signed_webhook(client, subscription_event("customer.subscription.deleted", "canceled"))
    assert client.post("/billing/checkout-session", json={"plan": "monthly"}, headers=headers).status_code == 200
