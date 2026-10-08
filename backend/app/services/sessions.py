"""One live login per cashier PIN.

State lives on the cashiers row (`session_token`, `session_seen_at`). Two ideas
keep it simple and forgiving:

- A session is *valid* while its token matches the row, however old `seen_at` is.
  A laptop that slept past the TTL just resumes.
- `seen_at` only decides whether a *new login* may take the PIN over. Past the TTL
  the holder is presumed dead (browser closed, power cut) and is replaced; its
  next request then fails with SESSION_INVALID.

All timestamps are naive UTC, like the other application-written columns.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Cashier

# Guarded requests refresh seen_at, but not on every call -- the heartbeat covers
# the gaps, and a write per request would be pointless churn.
_TOUCH_INTERVAL = timedelta(seconds=15)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def claim_session(db: Session, cashier_id: str) -> str | None:
    """Take the PIN for a new login. Returns the new token, or None if a live
    session already holds it.

    A single conditional UPDATE, so two registers submitting the same PIN at once
    cannot both win (a read-then-write would let them).
    """
    now = _now()
    cutoff = now - timedelta(seconds=settings.session_ttl_seconds)
    token = secrets.token_urlsafe(32)
    result = db.execute(
        update(Cashier)
        .where(
            Cashier.id == cashier_id,
            or_(Cashier.session_token.is_(None), Cashier.session_seen_at < cutoff),
        )
        .values(session_token=token, session_seen_at=now)
    )
    db.commit()
    return token if result.rowcount == 1 else None


def touch_session(db: Session, cashier: Cashier, *, force: bool = False) -> None:
    now = _now()
    if (
        not force
        and cashier.session_seen_at is not None
        and now - cashier.session_seen_at < _TOUCH_INTERVAL
    ):
        return
    cashier.session_seen_at = now
    db.commit()


def release_session(db: Session, cashier: Cashier) -> None:
    cashier.session_token = None
    cashier.session_seen_at = None
    db.commit()
