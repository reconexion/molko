from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow

ACTIVE_SUBSCRIPTION_STATUSES = {"active", "trialing"}
PAYMENT_ATTENTION_STATUSES = {"past_due", "unpaid", "incomplete", "paused"}


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # Se incrementa al cerrar sesión: invalida todos los tokens emitidos antes.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    name: Mapped[str | None] = mapped_column(String(60), nullable=True)

    # Idioma de la persona al crear la cuenta ("es" | "en").
    language: Mapped[str] = mapped_column(String(5), default="es", server_default="es", nullable=False)

    # Identificador estable de la cuenta de Google ("sub"); no cambia aunque cambie el correo.
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)

    # Cuándo Google comprobó que el correo es de la persona (None = cuenta con contraseña que
    # nadie ha confirmado). Sirve para defenderse del "pre-hijacking" al ligar Google.
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Constancia de la aceptación de los términos: qué versión y cuándo.
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    terms_version: Mapped[str | None] = mapped_column(String(20), nullable=True)

    subscription: Mapped["Subscription | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)

    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    plan: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "monthly" | "annual"
    status: Mapped[str] = mapped_column(String(30), default="inactive")  # active, trialing, past_due, canceled, inactive
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="subscription")

    @property
    def is_active(self) -> bool:
        return self.status in ACTIVE_SUBSCRIPTION_STATUSES

    @property
    def needs_payment_attention(self) -> bool:
        """Existe en Stripe y sigue viva pero sin pago al corriente: hay que arreglarla, no crear otra."""
        return self.stripe_subscription_id is not None and self.status in PAYMENT_ATTENTION_STATUSES

    @property
    def manageable(self) -> bool:
        # Las suscripciones otorgadas a mano (seed_trial_user) no existen en Stripe,
        # así que no tienen portal de facturación que abrir.
        return self.stripe_subscription_id is not None
