"""Auth -- a PIN lookup, not a credential exchange.

The backend is stateless with respect to login (spec 3.0): it issues no token and
validates no session. The frontend holds the session in localStorage. This endpoint
replaces the hardcoded CASHIERS map in session-store.ts.

Deliberately absent: GET /auth/cashiers (an unauthenticated endpoint enumerating
cashiers is a list of valid logins), /auth/logout and /auth/session (logout clears
localStorage; the server holds nothing to revoke). Do not add them.

Every route here is `def`, not `async def` -- firebird-driver is blocking, so an
async route would stall the event loop (spec 2.0).
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from ..dependencies import DbSession
from ..errors import invalid_pin
from ..models import Cashier
from ..schemas.auth import CashierOut, LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: DbSession) -> LoginResponse:
    """Resolve a PIN to its cashier.

    The PIN is an identifier, not just a gate -- it selects who is signed in. The
    response carries `id` because the frontend needs it for X-Cashier-Id.
    """
    cashier = db.scalar(
        select(Cashier).where(Cashier.pin == body.pin, Cashier.is_active)
    )
    if cashier is None:
        raise invalid_pin()
    return LoginResponse(cashier=CashierOut.model_validate(cashier))
