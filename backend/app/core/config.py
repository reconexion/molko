from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "change-me-in-production"
MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Molko API"
    # "production" apaga /docs y /openapi.json (mapa completo de la API para quien no debería verlo).
    environment: str = "development"
    database_url: str = "sqlite:///./molko.db"

    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Includes 5174 too: Vite falls back to it whenever something else on the
    # machine is already holding 5173 (common in local dev with multiple
    # projects running), so this avoids CORS breaking every time that happens.
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]
    frontend_url: str = "http://localhost:5173"

    # Versión vigente de los términos y condiciones. Debe coincidir con TERMS_VERSION en
    # frontend/src/legal/terms.ts; al cambiarla, cada usuario tendrá que volver a aceptar.
    terms_version: str = "2026-09-19"

    # URL pública de este backend: Google regresa aquí y debe estar registrada como
    # "URI de redireccionamiento autorizado" (<backend_url>/auth/google/callback).
    backend_url: str = "http://localhost:8000"

    # Iniciar sesión con Google. Sin client id y secret el botón no aparece.
    google_client_id: str = ""
    google_client_secret: str = ""
    # Endpoints y emisores configurables solo para poder probar con un proveedor falso.
    google_auth_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    google_token_url: str = "https://oauth2.googleapis.com/token"
    google_jwks_url: str = "https://www.googleapis.com/oauth2/v3/certs"
    google_issuers: list[str] = ["https://accounts.google.com", "accounts.google.com"]

    deepgram_api_key: str = ""

    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id_monthly: str = ""
    stripe_price_id_annual: str = ""

    # Cupo de cuentas para el lanzamiento controlado. 0 = sin límite; cuando se
    # alcanza, /auth/register se cierra y la gente entra a la lista de espera.
    max_users: int = 0

    # Descargador de YouTube: interruptor de apagado rápido + límites por usuario.
    youtube_enabled: bool = True
    youtube_monthly_limit: int = 20
    youtube_max_duration_seconds: int = 30 * 60


settings = Settings()
