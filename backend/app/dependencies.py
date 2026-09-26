"""Request-scoped dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .errors import unknown_cashier
from .models import Cashier

DbSession = Annotated[Session, Depends(get_db)]


def current_cashier(
    x_cashier_id: Annotated[str, Header()],
    db: DbSession,
) -> Cashier:
    """Resolve the X-Cashier-Id header to a live cashier.

    There is no server session (spec 3.0), so routes that record *who* did
    something take the cashier explicitly. A header rather than a query param keeps
    it out of access logs and off every route signature.

    This is the ONLY request-context header -- there is no register or terminal
    equivalent, because nothing is scoped that way (spec 1.6).

    Applied to exactly four routes: POST /products, PATCH /products/{id},
    POST /transactions, POST /transactions/{id}/void. Deliberately not global --
    everything else needs no actor, and a global dependency would make every GET
    fail without the header.
    """
    cashier = db.scalar(
        select(Cashier).where(Cashier.id == x_cashier_id, Cashier.is_active)
    )
    if cashier is None:
        raise unknown_cashier()
    return cashier


CurrentCashier = Annotated[Cashier, Depends(current_cashier)]
