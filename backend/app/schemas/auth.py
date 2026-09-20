from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


# SQLite devuelve datetimes sin zona; se marcan como UTC para que el JSON lleve
# el offset y el navegador no los interprete como hora local.
UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]

# bcrypt solo procesa los primeros 72 bytes; rechazar más evita truncar en silencio.
MAX_PASSWORD_BYTES = 72


MAX_NAME_LENGTH = 60


def clean_name(value: str | None) -> str | None:
    """Normaliza el nombre visible; None o vacío significa "sin nombre"."""
    if value is None:
        return None
    cleaned = " ".join(value.split())
    if not cleaned:
        return None
    if len(cleaned) > MAX_NAME_LENGTH:
        raise ValueError(f"El nombre no puede pasar de {MAX_NAME_LENGTH} caracteres")
    # isprintable() también rechaza caracteres invisibles o de control (p. ej. U+200B, U+202E).
    if not cleaned.isprintable() or "<" in cleaned or ">" in cleaned:
        raise ValueError("El nombre contiene caracteres no permitidos")
    return cleaned


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str | None = None
    accept_terms: bool = False
    language: Literal["es", "en"] = "es"

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str | None) -> str | None:
        return clean_name(value)

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, value: str) -> str:
        if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
            raise ValueError(f"La contraseña no puede pasar de {MAX_PASSWORD_BYTES} bytes")
        return value


class UpdateProfileRequest(BaseModel):
    name: str | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str | None) -> str | None:
        return clean_name(value)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=1024)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SubscriptionInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    plan: str | None
    status: str
    current_period_end: UtcDatetime | None
    is_active: bool
    manageable: bool


class YoutubeUsage(BaseModel):
    enabled: bool
    used: int
    limit: int


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    name: str | None
    terms_accepted: bool
    subscription: SubscriptionInfo | None
    youtube: YoutubeUsage


class AuthConfigResponse(BaseModel):
    signups_open: bool
    google_enabled: bool
