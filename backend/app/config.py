from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(default="", alias="DATABASE_URL")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwt_secret: str = Field(default="", alias="SUPABASE_JWT_SECRET")
    ai_provider: str = Field(default="openrouter", alias="AI_PROVIDER")
    ai_base_url: str = Field(default="", alias="AI_BASE_URL")
    ai_api_key: str = Field(default="", alias="AI_API_KEY")
    ai_model: str = Field(default="", alias="AI_MODEL")
    ai_request_timeout_seconds: float = Field(default=90, alias="AI_REQUEST_TIMEOUT_SECONDS")
    ai_private_endpoint: bool = Field(default=False, alias="AI_PRIVATE_ENDPOINT")
    ai_external_mode: str = Field(default="redacted_only", alias="AI_EXTERNAL_MODE")
    ai_max_egress_characters: int = Field(default=60_000, alias="AI_MAX_EGRESS_CHARACTERS")
    ai_privacy_audit_required: bool = Field(default=False, alias="AI_PRIVACY_AUDIT_REQUIRED")
    ai_chat_retention_days: int = Field(default=30, alias="AI_CHAT_RETENTION_DAYS")
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openrouter_model: str = Field(default="", alias="OPENROUTER_MODEL")
    openrouter_zdr_required: bool = Field(default=True, alias="OPENROUTER_ZDR_REQUIRED")
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
