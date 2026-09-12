import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.auth import SubscriptionInfo
from app.schemas.billing import CheckoutSessionRequest, CheckoutSessionResponse, PortalSessionResponse
from app.services import stripe_service

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/checkout-session", response_model=CheckoutSessionResponse)
def checkout_session(
    payload: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    url = stripe_service.create_checkout_session(db, current_user, payload.plan)
    return CheckoutSessionResponse(checkout_url=url)


@router.post("/portal-session", response_model=PortalSessionResponse)
def portal_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    url = stripe_service.create_portal_session(db, current_user)
    return PortalSessionResponse(portal_url=url)


@router.get("/status", response_model=SubscriptionInfo)
def status_endpoint(current_user: User = Depends(get_current_user)):
    if current_user.subscription is None:
        raise HTTPException(status_code=404, detail="Sin registro de suscripción")
    return current_user.subscription


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe_service.construct_webhook_event(payload, sig_header)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Webhook inválido")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        stripe_service.handle_checkout_session_completed(db, data)
    elif event_type == "customer.subscription.updated":
        stripe_service.handle_subscription_updated(db, data)
    elif event_type == "customer.subscription.deleted":
        stripe_service.handle_subscription_deleted(db, data)

    return {"received": True}
