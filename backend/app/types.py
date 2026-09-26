"""Firebird-specific column type helpers."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Dialect, TypeDecorator
from sqlalchemy.dialects import registry  # noqa: F401
from sqlalchemy_firebird.types import FBCHAR


class UUIDStrType(TypeDecorator):
    """CHAR(36) CHARACTER SET OCTETS that reads and writes `str`.

    Firebird has no UUID type. OCTETS is the right storage choice for a pure-ASCII
    hex column -- no collation work, and 36 bytes rather than 144 under a UTF8
    default charset -- but the driver hands OCTETS columns back as `bytes`. Left
    unconverted, every `model.id == some_str` comparison in Python is False while
    the equivalent SQL comparison succeeds, which fails in a thoroughly confusing
    way: lookups by id work, in-memory matching silently does not.

    This decorator does the encode/decode at the column boundary so the rest of the
    application only ever sees `str`, matching the frontend's `id: string`.

    CHAR is fixed-width, so trailing-space semantics apply -- safe here only because
    a UUID is always exactly 36 characters. Never use this for a variable-length key.
    """

    impl = FBCHAR(36, charset="OCTETS")
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        if isinstance(value, bytes):
            return value
        return str(value).encode("ascii")

    def process_result_value(self, value: Any, dialect: Dialect) -> str | None:
        if value is None:
            return None
        if isinstance(value, bytes):
            return value.decode("ascii").rstrip()
        return str(value).rstrip()


UUIDStr = UUIDStrType()
