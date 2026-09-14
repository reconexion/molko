from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Molko API"

    # Includes 5174 too: Vite falls back to it whenever something else on the
    # machine is already holding 5173 (common in local dev with multiple
    # projects running), so this avoids CORS breaking every time that happens.
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    deepgram_api_key: str = ""


settings = Settings()
