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

    # 127.0.0.1 in dev; production binds 0.0.0.0 so the shop's LAN clients can
    # reach it without pinning the host's LAN IP (no internet exposure -- the
    # Windows box isn't routable beyond the shop's LAN).
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # Windows only, when fbclient.dll is kept off PATH (spec 4). Left unset on macOS.
    fb_client_library: str | None = None

    # "network" (escpresso / a LAN-connected printer), "usb" (the real TM-U220D,
    # which is USB-attached), or "dummy" (buffers bytes, no I/O -- for testing).
    printer_backend: str = "network"
    printer_host: str = "127.0.0.1"
    printer_port: int = 9100
    # Hex strings (e.g. "04b8"). Optional -- when unset, printer.py auto-detects the
    # USB Printer Class device via pyusb. Only needed if the shop ever has more than
    # one USB printer class device attached, or auto-detection fails.
    printer_usb_vendor_id: str | None = None
    printer_usb_product_id: str | None = None

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
