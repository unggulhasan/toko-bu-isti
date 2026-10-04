"""Parked carts. Replaces the pos:open-sales localStorage slice.

Carts are stored server-side but scoped to the cashier who created them (the
X-Cashier-Id header), so two registers signed in as different cashiers each see
only their own. A cart parked on the server laptop can still be resumed on the
client laptop by signing in with the same PIN, which the localStorage version
could not do. Every route takes CurrentCashier; a cart owned by someone else is
reported as not found rather than forbidden, so ids reveal nothing.

All routes are `def`, never `async def` (spec 2.0).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from ..dependencies import CurrentCashier, DbSession
from ..errors import line_not_found, open_sale_not_found, product_not_found
from ..models import Cashier, OpenSale, OpenSaleLine, Product
from ..schemas.sale import (
    OpenSaleList,
    OpenSaleOut,
    ScanRequest,
    ScanResponse,
    SetQtyRequest,
)
from ..services.sale_numbers import with_retry

router = APIRouter(prefix="/open-sales", tags=["open-sales"])

# MERGE, not UPDATE OR INSERT: the latter overwrites qty with the supplied value,
# whereas the frontend's rule is to *increment* an existing line. Upserts against
# the uq_osl_sale_barcode key.
_MERGE_LINE = text(
    """
    MERGE INTO open_sale_lines t
    USING (SELECT CAST(:sale_id AS CHAR(36) CHARACTER SET OCTETS) AS sale_id,
                  CAST(:barcode AS VARCHAR(64)) AS barcode
             FROM rdb$database) s
       ON t.sale_id = s.sale_id AND t.barcode = s.barcode
     WHEN MATCHED THEN UPDATE SET qty = t.qty + 1
     WHEN NOT MATCHED THEN
          INSERT (id, sale_id, product_id, barcode, name, price, qty, "position")
          VALUES (CAST(:new_id AS CHAR(36) CHARACTER SET OCTETS),
                  CAST(:sale_id AS CHAR(36) CHARACTER SET OCTETS),
                  CAST(:product_id AS CHAR(36) CHARACTER SET OCTETS),
                  CAST(:barcode AS VARCHAR(64)),
                  CAST(:name AS VARCHAR(160)),
                  :price, 1, :position)
    """
)


def _load_sale(db: Session, sale_id: str, cashier: Cashier) -> OpenSale:
    sale = db.scalar(
        select(OpenSale)
        .options(selectinload(OpenSale.lines))
        .where(OpenSale.id == sale_id, OpenSale.cashier_id == cashier.id)
    )
    if sale is None:
        raise open_sale_not_found()
    return sale


def _out(sale: OpenSale) -> OpenSaleOut:
    return OpenSaleOut.model_validate(sale)


@router.get("", response_model=OpenSaleList)
def list_open_sales(db: DbSession, cashier: CurrentCashier) -> OpenSaleList:
    """The signed-in cashier's parked carts, ordered by position.

    Returns an empty list when there are none -- a GET must not create rows. The
    frontend assumes at least one active sale exists, but a side-effecting GET
    breaks idempotency and is retried freely by browsers and proxies, which would
    spawn stray carts. The frontend calls POST when it receives an empty list.
    """
    sales = db.scalars(
        select(OpenSale)
        .options(selectinload(OpenSale.lines))
        .where(OpenSale.cashier_id == cashier.id)
        .order_by(OpenSale.position)
    ).all()
    return OpenSaleList(items=[_out(s) for s in sales])


@router.post("", response_model=OpenSaleOut, status_code=status.HTTP_201_CREATED)
def create_open_sale(db: DbSession, cashier: CurrentCashier) -> OpenSaleOut:
    """New empty cart for this cashier, appended after their current last position."""
    next_position = (
        db.scalar(
            select(func.max(OpenSale.position)).where(OpenSale.cashier_id == cashier.id)
        )
        or -1
    ) + 1
    sale = OpenSale(position=next_position, cashier_id=cashier.id)
    db.add(sale)
    db.commit()
    return _out(_load_sale(db, sale.id, cashier))


@router.get("/{sale_id}", response_model=OpenSaleOut)
def get_open_sale(sale_id: str, db: DbSession, cashier: CurrentCashier) -> OpenSaleOut:
    return _out(_load_sale(db, sale_id, cashier))


@router.delete("/{sale_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_open_sale(sale_id: str, db: DbSession, cashier: CurrentCashier) -> Response:
    """Discard a cart. 204 with an empty body -- no replacement cart is returned:
    204 forbids a body, and auto-creating a replacement would make DELETE
    non-idempotent. The frontend creates the next cart explicitly."""
    sale = _load_sale(db, sale_id, cashier)
    db.delete(sale)  # lines go via ON DELETE CASCADE / delete-orphan
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{sale_id}/scan", response_model=ScanResponse)
def scan_into_sale(
    sale_id: str, body: ScanRequest, db: DbSession, cashier: CurrentCashier
) -> ScanResponse:
    """Scan a barcode into the cart.

    Found and already in the cart -> increment that line's qty. Found and new ->
    append with qty 1. Not found -> 404, which is what produces the frontend's
    `Barkode "<code>" tidak ditemukan`.

    Price is snapshotted at FIRST scan, not at checkout: if the catalog price
    changes while a cart is parked, the parked line keeps the old price. That is
    the intent, though it means a cart parked for days sells at a stale price.
    """
    # Ownership check only; the merge below addresses the cart by id.
    _load_sale(db, sale_id, cashier)
    barcode = body.barcode.strip()

    product = db.scalar(select(Product).where(Product.barcode == barcode, Product.is_active))
    if product is None:
        raise product_not_found(barcode)

    outcome: dict[str, object] = {}

    def _merge() -> None:
        # Everything this closure depends on is read INSIDE it, because with_retry
        # calls it again from scratch after a rollback -- state captured before a
        # lost contention race is stale. In particular `existing` decides `created`,
        # and another scan of the same barcode may have created the line in between.
        existing = db.scalar(
            select(OpenSaleLine).where(
                OpenSaleLine.sale_id == sale_id, OpenSaleLine.barcode == barcode
            )
        )
        position = db.scalar(
            select(func.count()).select_from(OpenSaleLine).where(OpenSaleLine.sale_id == sale_id)
        ) or 0
        new_id = str(uuid.uuid4())

        db.execute(
            _MERGE_LINE,
            {
                "sale_id": sale_id,
                "barcode": barcode,
                "new_id": new_id,
                "product_id": product.id,
                "name": product.name,
                "price": product.price,
                "position": position,
            },
        )
        db.commit()
        outcome["created"] = existing is None
        outcome["line_id"] = new_id if existing is None else existing.id

    with_retry(_merge, db)

    db.expire_all()
    return ScanResponse(
        sale=_out(_load_sale(db, sale_id, cashier)),
        scanned_line_id=str(outcome["line_id"]),
        created=bool(outcome["created"]),
    )


@router.patch("/{sale_id}/lines/{line_id}", response_model=OpenSaleOut)
def set_line_qty(
    sale_id: str,
    line_id: str,
    body: SetQtyRequest,
    db: DbSession,
    cashier: CurrentCashier,
) -> OpenSaleOut:
    """Set a line's qty. qty <= 0 DELETEs the line rather than clamping to 0, which
    matches setLineQty and keeps this consistent with ck_osl_qty_positive."""

    def _set() -> None:
        # Re-read inside the closure: with_retry re-runs this from scratch after a
        # rollback, and the line fetched before a lost contention race is stale.
        sale = _load_sale(db, sale_id, cashier)
        line = _find_line(sale, line_id)

        if body.qty <= 0:
            db.delete(line)
        else:
            line.qty = body.qty
        db.commit()

    with_retry(_set, db)

    db.expire_all()
    return _out(_load_sale(db, sale_id, cashier))


@router.delete("/{sale_id}/lines/{line_id}", response_model=OpenSaleOut)
def remove_line(
    sale_id: str, line_id: str, db: DbSession, cashier: CurrentCashier
) -> OpenSaleOut:
    def _remove() -> None:
        sale = _load_sale(db, sale_id, cashier)
        db.delete(_find_line(sale, line_id))
        db.commit()

    with_retry(_remove, db)

    db.expire_all()
    return _out(_load_sale(db, sale_id, cashier))


def _find_line(sale: OpenSale, line_id: str) -> OpenSaleLine:
    for line in sale.lines:
        if line.id == line_id:
            return line
    raise line_not_found()
