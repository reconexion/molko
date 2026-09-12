from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SubscriptionInfo(BaseModel):
    plan: str | None
    status: str
    current_period_end: datetime | None
    is_active: bool

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    subscription: SubscriptionInfo | None

    class Config:
        from_attributes = True
