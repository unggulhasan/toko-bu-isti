from __future__ import annotations

from pydantic import Field

from .common import CamelModel


class LoginRequest(CamelModel):
    # A POST body, not a URL param, so PINs never land in access logs or browser
    # history (spec 3.0).
    pin: str = Field(min_length=4, max_length=8)


class CashierOut(CamelModel):
    id: str
    name: str


class LoginResponse(CamelModel):
    cashier: CashierOut
