from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    subscription: Mapped["Subscription | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)

    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    plan: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "monthly" | "annual"
    status: Mapped[str] = mapped_column(String(30), default="inactive")  # active, past_due, canceled, inactive
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="subscription")

    @property
    def is_active(self) -> bool:
        return self.status == "active"
