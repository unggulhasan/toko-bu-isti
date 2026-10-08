"""Auth -- a PIN lookup that claims the cashier's single live session.

Login issues an opaque session token and records it on the cashier row; a PIN can
be held by only one login at a time (services/sessions.py). Guarded routes check the
token (dependencies.current_cashier), so a register that was replaced is rejected
rather than silently sharing carts with the new one. The frontend still holds its
session in localStorage -- the server remembers only which token is current.

/auth/logout and /auth/heartbeat exist because of that: logout frees the PIN
immediately, and the heartbeat keeps it held (a holder that stops pinging for
`session_ttl_seconds` can be replaced).

Deliberately absent: GET /auth/cashiers (an unauthenticated endpoint enumerating
cashiers is a list of valid logins). Do not add it.

Every route here is `def`, not `async def` -- firebird-driver is blocking, so an
async route would stall the event loop (spec 2.0).
"""

from __future__ import annotations

from fastapi import APIRouter, Response
from sqlalchemy import select

from ..dependencies import CurrentCashier, DbSession
from ..errors import invalid_pin, pin_in_use
from ..models import Cashier
from ..schemas.auth import CashierOut, LoginRequest, LoginResponse
from ..services.sessions import claim_session, release_session, touch_session

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: DbSession) -> LoginResponse:
    """Resolve a PIN to its cashier.

    The PIN is an identifier, not just a gate -- it selects who is signed in. The
    response carries `id` and `sessionToken` because the frontend needs both for
    guarded requests. 409 PIN_IN_USE if another login for this PIN is still live.
    """
    cashier = db.scalar(
        select(Cashier).where(Cashier.pin == body.pin, Cashier.is_active)
    )
    if cashier is None:
        raise invalid_pin()
    token = claim_session(db, cashier.id)
    if token is None:
        raise pin_in_use()
    return LoginResponse(cashier=CashierOut.model_validate(cashier), session_token=token)


@router.post("/heartbeat", status_code=204)
def heartbeat(cashier: CurrentCashier, db: DbSession) -> Response:
    """Keep this login's hold on the PIN alive. A replaced session gets 401."""
    touch_session(db, cashier, force=True)
    return Response(status_code=204)


@router.post("/logout", status_code=204)
def logout(cashier: CurrentCashier, db: DbSession) -> Response:
    """Free the PIN so another register can log in with it right away."""
    release_session(db, cashier)
    return Response(status_code=204)
