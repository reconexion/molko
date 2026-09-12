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

    # Testing-only escape hatches, secure by default. Set REQUIRE_AUTH=false
    # or REQUIRE_SUBSCRIPTION=false in .env to bypass login or the paywall
    # during local testing — never in a deployed environment.
    require_auth: bool = True
    require_subscription: bool = True


settings = Settings()
