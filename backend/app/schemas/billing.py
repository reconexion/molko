from typing import Literal

from pydantic import BaseModel


class CheckoutSessionRequest(BaseModel):
    plan: Literal["monthly", "annual"]


class CheckoutSessionResponse(BaseModel):
    checkout_url: str


class PortalSessionResponse(BaseModel):
    portal_url: str
