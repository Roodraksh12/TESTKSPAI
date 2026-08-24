from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(default="", alias="DATABASE_URL")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwt_secret: str = Field(default="", alias="SUPABASE_JWT_SECRET")
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openrouter_model: str = Field(default="", alias="OPENROUTER_MODEL")
    allowed_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="ALLOWED_ORIGINS",
    )
    smtp_host: str = Field(default="", alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_user: str = Field(default="", alias="SMTP_USER")
    smtp_password: str = Field(default="", alias="SMTP_PASSWORD")
    smtp_from: str = Field(default="", alias="SMTP_FROM")
    smtp_use_tls: bool = Field(default=True, alias="SMTP_USE_TLS")
    app_public_url: str = Field(default="http://localhost:5173", alias="APP_PUBLIC_URL")
    temp_password_ttl_hours: int = Field(default=48, alias="TEMP_PASSWORD_TTL_HOURS")
    bootstrap_badge_id: str = Field(default="KA-IT-0001", alias="BOOTSTRAP_BADGE_ID")
    bootstrap_password: str = Field(default="demo1234", alias="BOOTSTRAP_PASSWORD")

    # A developer-only .env.test can override .env for this clone without ever
    # replacing the shared environment file. Both names are gitignored.
    model_config = SettingsConfigDict(env_file=(".env", ".env.test"), env_file_encoding="utf-8", extra="ignore")

    @property
    def jwt_secret(self) -> str:
        secret = self.supabase_jwt_secret.strip()
        if not secret:
            raise RuntimeError(
                "SUPABASE_JWT_SECRET is required; refusing to sign tokens with an insecure default"
            )
        return secret

    @property
    def allowed_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host)

@lru_cache
def get_settings() -> Settings:
    return Settings()
