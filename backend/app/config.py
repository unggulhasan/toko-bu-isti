"""Application settings, loaded from backend/.env."""

from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str

    # Comma-separated in .env. Declared as a plain str and split below, because a
    # list[str] field would make pydantic-settings demand a JSON array instead.
    cors_origins: str = "http://localhost:3000"

    # Never 0.0.0.0 (spec 3.0): bind to loopback in dev, to the static LAN IP in
    # production, so the API is not exposed on whatever other interface the laptop
    # happens to acquire.
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # Windows only, when fbclient.dll is kept off PATH (spec 4). Left unset on macOS.
    fb_client_library: str | None = None

    @field_validator("database_url")
    @classmethod
    def _require_url(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("DATABASE_URL must not be empty")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]
