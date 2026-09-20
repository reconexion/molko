import stripe
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, user_rate_limit
from app.core.config import settings
from app.core.errors import api_error
from app.db.base import get_db
from app.models.user import User
from app.schemas.auth import SubscriptionInfo
from app.schemas.billing import CheckoutSessionRequest, CheckoutSessionResponse, PortalSessionResponse
from app.services import stripe_service
from app.services.stripe_service import StripeNotConfiguredError

router = APIRouter(prefix="/billing", tags=["billing"])

billing_rate_limit = user_rate_limit("billing", limit=20, window_seconds=3600)

NOT_CONFIGURED = api_error(
    status.HTTP_503_SERVICE_UNAVAILABLE, "payments_not_configured", "Los pagos todavía no están configurados"
)
PROVIDER_ERROR = api_error(
    status.HTTP_502_BAD_GATEWAY, "payments_provider_error", "No se pudo contactar al proveedor de pagos"
)


@router.post("/checkout-session", response_model=CheckoutSessionResponse, dependencies=[Depends(billing_rate_limit)])
def checkout_session(
    payload: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.subscription is not None and current_user.subscription.is_active:
        raise api_error(status.HTTP_409_CONFLICT, "already_subscribed", "Ya tienes una suscripción activa")
    if current_user.subscription is not None and current_user.subscription.needs_payment_attention:
        # Otra suscripción nueva cobraría dos veces si la anterior se recupera.
        raise api_error(
            status.HTTP_409_CONFLICT,
            "subscription_payment_pending",
            "Tu suscripción tiene un pago pendiente: actualiza tu método de pago desde tu cuenta",
        )
    try:
        url = stripe_service.create_checkout_session(db, current_user, payload.plan)
    except StripeNotConfiguredError:
        raise NOT_CONFIGURED
    except stripe.StripeError:
        raise PROVIDER_ERROR
    return CheckoutSessionResponse(checkout_url=url)


@router.post("/portal-session", response_model=PortalSessionResponse, dependencies=[Depends(billing_rate_limit)])
def portal_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        url = stripe_service.create_portal_session(db, current_user)
    except StripeNotConfiguredError:
        raise NOT_CONFIGURED
    except stripe.StripeError:
        raise PROVIDER_ERROR
    return PortalSessionResponse(portal_url=url)


@router.get("/status", response_model=SubscriptionInfo)
def status_endpoint(current_user: User = Depends(get_current_user)):
    if current_user.subscription is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "no_subscription_record", "Sin registro de suscripción")
    return current_user.subscription


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe_service.construct_webhook_event(payload, sig_header)
    except StripeNotConfiguredError:
        raise NOT_CONFIGURED
    except (ValueError, stripe.SignatureVerificationError):
        raise api_error(status.HTTP_400_BAD_REQUEST, "invalid_webhook", "Webhook inválido")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        stripe_service.handle_checkout_session_completed(db, data)
    elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
        stripe_service.handle_subscription_changed(db, data)
    elif event_type == "customer.subscription.deleted":
        stripe_service.handle_subscription_deleted(db, data)

    return {"received": True}
