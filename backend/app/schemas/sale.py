from __future__ import annotations

from pydantic import Field, computed_field

from .common import CamelModel, UtcDateTime


class SaleLineOut(CamelModel):
    """Matches frontend/lib/types.ts SaleLine.

    barcode / name / price are denormalized snapshots taken at scan time, not joins
    to the catalog -- a receipt must show the price charged at the time.
    """

    id: str
    product_id: str | None
    barcode: str
    name: str
    price: int
    qty: int


class OpenSaleOut(CamelModel):
    """A parked cart, with server-computed totals so the client need not recompute
    them for the summary panel."""

    id: str
    created_at: UtcDateTime
    position: int
    lines: list[SaleLineOut]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total(self) -> int:
        return sum(line.price * line.qty for line in self.lines)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def units(self) -> int:
        return sum(line.qty for line in self.lines)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def line_count(self) -> int:
        return len(self.lines)


class OpenSaleList(CamelModel):
    items: list[OpenSaleOut]


class ScanRequest(CamelModel):
    barcode: str = Field(min_length=1, max_length=64)


class ScanResponse(CamelModel):
    sale: OpenSaleOut
    # Drives the frontend's justScannedLineId (the 1.5s highlight).
    scanned_line_id: str
    # False means qty was incremented on an existing line rather than appended.
    created: bool


class SetQtyRequest(CamelModel):
    # qty <= 0 deletes the line rather than storing it, matching setLineQty and
    # keeping this endpoint consistent with ck_osl_qty_positive.
    qty: int
