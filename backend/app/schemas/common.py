"""Shared Pydantic plumbing: camelCase aliasing, UTC serialization, pagination."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel


def _as_utc_iso(dt: datetime) -> str:
    """Render a naive database timestamp as an ISO-8601 string ending in Z.

    Firebird's dialect maps DateTime to TIMESTAMP WITHOUT TIME ZONE, so everything
    read back is naive. UTC is an application convention, and the frontend does
    `new Date(str)` -- which parses a naive string as *local* time. Without the Z
    that is a silent multi-hour skew on a Jakarta machine, wrong in a way that
    still looks plausible in some views. Attaching it in one place is the point.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


UtcDateTime = Annotated[datetime, PlainSerializer(_as_utc_iso, return_type=str)]


class CamelModel(BaseModel):
    """JSON is camelCase to match the existing TS types; columns stay snake_case."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        serialize_by_alias=True,
    )


ItemT = TypeVar("ItemT")


class Page(CamelModel, Generic[ItemT]):
    """Shared list envelope for GET /products and GET /transactions."""

    items: list[ItemT]
    total: int
    page: int
    page_size: int
    page_count: int


def paginate(items: list[ItemT], total: int, page: int, page_size: int) -> Page[ItemT]:
    page_count = (total + page_size - 1) // page_size if page_size else 0
    return Page[ItemT](
        items=items, total=total, page=page, page_size=page_size, page_count=page_count
    )
