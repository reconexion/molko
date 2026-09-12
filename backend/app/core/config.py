from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Molko API"
    database_url: str = "sqlite:///./molko.db"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    cors_origins: list[str] = ["http://localhost:5173"]

    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id_monthly: str = ""
    stripe_price_id_annual: str = ""
    frontend_url: str = "http://localhost:5173"

    deepgram_api_key: str = ""

    # Temporary testing switches. When require_auth is False, every request is
    # treated as a single fixed test user (no register/login needed). When
    # require_subscription is False, the paywall gate is skipped. Flip both
    # back to True before shipping.
    require_auth: bool = False
    require_subscription: bool = False


settings = Settings()
