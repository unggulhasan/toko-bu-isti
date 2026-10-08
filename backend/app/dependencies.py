"""Request-scoped dependencies."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .errors import (
    backup_password_invalid,
    restore_password_invalid,
    session_invalid,
    unknown_cashier,
)
from .models import Cashier
from .services.sessions import touch_session

DbSession = Annotated[Session, Depends(get_db)]

# Hardcoded on purpose: a deterrent against accidental or casual use of the
# catalog backup/restore (a restore replaces every product), not real secrecy.
# Changing one means a code change and a redeploy.
BACKUP_PASSWORD = "WildTurkey09"
RESTORE_PASSWORD = "CableMan01"


def _matches(supplied: str | None, expected: str) -> bool:
    # A missing header counts as wrong (a 403, not a 422 that reveals the
    # header exists). Compared as bytes so non-ASCII input cannot raise.
    if supplied is None:
        return False
    return secrets.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))


def require_backup_password(
    x_backup_password: Annotated[str | None, Header()] = None,
) -> None:
    """Gate for GET /products/export. Runs before the route body."""
    if not _matches(x_backup_password, BACKUP_PASSWORD):
        raise backup_password_invalid()


def require_restore_password(
    x_backup_password: Annotated[str | None, Header()] = None,
) -> None:
    """Gate for POST /products/import. Runs before the body is parsed and
    before any row is deleted. Same header as backup; the route picks which
    password it is compared against."""
    if not _matches(x_backup_password, RESTORE_PASSWORD):
        raise restore_password_invalid()


def current_cashier(
    x_cashier_id: Annotated[str, Header()],
    db: DbSession,
    x_session_token: Annotated[str | None, Header()] = None,
) -> Cashier:
    """Resolve X-Cashier-Id + X-Session-Token to the cashier holding that login.

    Routes that record *who* did something take the cashier explicitly. A header
    rather than a query param keeps it out of access logs and off every route
    signature. The token proves the caller is the register that logged in -- only
    one login per PIN is live at a time (services/sessions.py), and once another
    register takes the PIN over, the old token stops working (401 SESSION_INVALID).

    There is no register or terminal id. Open-sale carts are scoped by cashier
    instead, so two registers signed in as different cashiers do not see each
    other's carts.

    Applied to POST /products, PATCH /products/{id}, POST /transactions,
    POST /transactions/{id}/void and every /open-sales route. Deliberately not
    global -- the rest (catalog reads, login) need no actor, and a global
    dependency would make every GET fail without the header.
    """
    cashier = db.scalar(
        select(Cashier).where(Cashier.id == x_cashier_id, Cashier.is_active)
    )
    if cashier is None:
        raise unknown_cashier()
    # A missing header counts as wrong (401, not a 422), like the passwords above.
    if (
        cashier.session_token is None
        or x_session_token is None
        or not _matches(x_session_token, cashier.session_token)
    ):
        raise session_invalid()
    touch_session(db, cashier)
    return cashier


CurrentCashier = Annotated[Cashier, Depends(current_cashier)]
