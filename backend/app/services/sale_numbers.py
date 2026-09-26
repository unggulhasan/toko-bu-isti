"""Sale-number allocation and the write-path retry helper (spec 2.3)."""

from __future__ import annotations

import random
import time
from typing import Callable, TypeVar

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

# A fixed generator name means this is a constant -- no name is formatted into the
# SQL, so there is no injection surface a dynamically-named generator would need
# guarding against.
_NEXT_SALE_NUMBER = text("SELECT NEXT VALUE FOR gen_sale_number FROM rdb$database")


def allocate_sale_number(db: Session) -> int:
    """Atomic, lock-free, and safe under any isolation level.

    A generator rather than a locked counter row: Firebird's MVCC raises a lock
    conflict on write-write contention instead of queueing, so a locked row would
    turn every concurrent checkout into an application-level retry. Generators sit
    outside transaction control and never block.

    The tradeoff, accepted for this project: a rolled-back checkout burns its
    number, so the receipt sequence develops gaps (#1043 may be followed by #1045).
    Two things follow -- saleNumber is never a count of sales (use
    GET /transactions/summary), and a missing number is not evidence of a lost sale.
    """
    return db.execute(_NEXT_SALE_NUMBER).scalar_one()


T = TypeVar("T")

_RETRYABLE = ("deadlock", "lock conflict", "concurrent transaction")


def is_retryable(exc: DBAPIError) -> bool:
    """Whether a Firebird error represents lost contention rather than a real fault.

    SQLAlchemy wraps DB-API errors, so this has to look at `exc.orig` -- matching
    only the bare firebird.driver.types.DatabaseError would silently never retry.
    Firebird reports these as "deadlock / update conflicts with concurrent update".
    """
    message = f"{exc.orig}\n{exc}".lower()
    return any(token in message for token in _RETRYABLE)


def with_retry(fn: Callable[[], T], db: Session, attempts: int = 6) -> T:
    """Retry a write that lost a Firebird contention race.

    Firebird surfaces contention as an exception rather than blocking, so every
    write path that can collide needs this.

    `fn` must re-read whatever it depends on: it is called again from scratch after
    a rollback, and any row state captured before the conflict is stale. A short
    randomized backoff keeps a pile-up of simultaneous writers from re-colliding in
    lockstep on every attempt.
    """
    for attempt in range(attempts):
        try:
            return fn()
        except DBAPIError as exc:
            if attempt == attempts - 1 or not is_retryable(exc):
                raise
            db.rollback()
            time.sleep(random.uniform(0.01, 0.05) * (attempt + 1))
    raise AssertionError("unreachable")  # pragma: no cover
