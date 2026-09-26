from __future__ import annotations

from datetime import datetime

from pydantic import Field

from ..models import TransactionStatus
from .common import CamelModel, UtcDateTime


class TransactionLineOut(CamelModel):
    """Matches frontend/lib/types.ts SaleLine.

    `lineTotal` exists as a stored column but is deliberately not on the wire: the
    frontend renders receipts from price * qty and its SaleLine type has no such
    field. The column exists so historical totals never drift.
    """

    id: str
    product_id: str | None
    barcode: str
    name: str
    price: int
    qty: int


class TransactionOut(CamelModel):
    id: str
    sale_number: int
    lines: list[TransactionLineOut]
    total: int
    tendered: int
    change: int
    cashier_name: str
    created_at: UtcDateTime
    status: TransactionStatus
    voided_at: UtcDateTime | None = None
    voided_by: str | None = None


class TransactionListItem(CamelModel):
    """The list omits `lines` for payload size; the receipt panel fetches detail
    by id. This is a change from today's frontend, where every transaction arrives
    with its lines attached."""

    id: str
    sale_number: int
    total: int
    tendered: int
    change: int
    cashier_name: str
    created_at: UtcDateTime
    status: TransactionStatus
    voided_at: UtcDateTime | None = None
    voided_by: str | None = None


class CheckoutRequest(CamelModel):
    """Only the cart and the cash received. The server derives everything else --
    notably `total`, which is never taken from the client (spec 3.4)."""

    open_sale_id: str
    tendered: int = Field(ge=0)


class SummaryOut(CamelModel):
    """Exactly what TransactionsStatStrip renders.

    `gross` and `cashInDrawer` are the same number today -- with no discounts, tax
    or non-cash tender, summing line totals and summing transaction totals give
    identical results. Both are returned because the frontend renders both tiles.

    Note `cashInDrawer` is not literal drawer contents: it ignores the opening float
    and the change paid out. It is takings, despite the label.
    """

    sales_count: int
    gross: int
    cash_in_drawer: int
    voided_count: int


class DateRange(CamelModel):
    from_: datetime | None = Field(default=None, alias="from")
    to: datetime | None = None
