"""Application settings, loaded from backend/.env."""

from __future__ import annotations

import tomllib
from pathlib import Path
from zoneinfo import ZoneInfo

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

    # A login whose browser has not pinged for this long no longer blocks the PIN.
    # The frontend heartbeats every 30 s, so this tolerates a few missed pings.
    session_ttl_seconds: int = 120

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

# The shop is on one Windows PC in Indonesia; the frontend gets local time for
# free because browser Date methods use the OS timezone, but the backend runs
# in UTC (created_at is stored in UTC -- see the Firebird session_time_zone
# note in database.py), so conversions have to happen explicitly.
STORE_TIMEZONE = ZoneInfo("Asia/Jakarta")


def _read_app_version() -> str:
    # One source of truth: backend/pyproject.toml. The project is not installed
    # as a package, so importlib.metadata has nothing to read. Read once at
    # import, i.e. at server start -- a restart picks up a new version.
    pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
    with pyproject.open("rb") as f:
        return str(tomllib.load(f)["project"]["version"])


APP_VERSION = _read_app_version()
