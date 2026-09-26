"""Parked carts. Replaces the pos:open-sales localStorage slice.

There is one set of carts for the shop, not per terminal (spec 1.6) -- so a cart
parked on the server laptop can be resumed on the client laptop, which the
localStorage version could not do.

All routes are `def`, never `async def` (spec 2.0).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from ..dependencies import DbSession
from ..errors import line_not_found, open_sale_not_found, product_not_found
from ..models import OpenSale, OpenSaleLine, Product
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


def _load_sale(db: Session, sale_id: str) -> OpenSale:
    sale = db.scalar(
        select(OpenSale).options(selectinload(OpenSale.lines)).where(OpenSale.id == sale_id)
    )
    if sale is None:
        raise open_sale_not_found()
    return sale


def _out(sale: OpenSale) -> OpenSaleOut:
    return OpenSaleOut.model_validate(sale)


@router.get("", response_model=OpenSaleList)
def list_open_sales(db: DbSession) -> OpenSaleList:
    """All parked carts, ordered by position.

    Returns an empty list when there are none -- a GET must not create rows. The
    frontend assumes at least one active sale exists, but a side-effecting GET
    breaks idempotency and is retried freely by browsers and proxies, which would
    spawn stray carts. The frontend calls POST when it receives an empty list.
    """
    sales = db.scalars(
        select(OpenSale).options(selectinload(OpenSale.lines)).order_by(OpenSale.position)
    ).all()
    return OpenSaleList(items=[_out(s) for s in sales])


@router.post("", response_model=OpenSaleOut, status_code=status.HTTP_201_CREATED)
def create_open_sale(db: DbSession) -> OpenSaleOut:
    """New empty cart, appended after the current last position."""
    next_position = (db.scalar(select(func.max(OpenSale.position))) or -1) + 1
    sale = OpenSale(position=next_position)
    db.add(sale)
    db.commit()
    return _out(_load_sale(db, sale.id))


@router.get("/{sale_id}", response_model=OpenSaleOut)
def get_open_sale(sale_id: str, db: DbSession) -> OpenSaleOut:
    return _out(_load_sale(db, sale_id))


@router.delete("/{sale_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_open_sale(sale_id: str, db: DbSession) -> Response:
    """Discard a cart. 204 with an empty body -- no replacement cart is returned:
    204 forbids a body, and auto-creating a replacement would make DELETE
    non-idempotent. The frontend creates the next cart explicitly."""
    sale = _load_sale(db, sale_id)
    db.delete(sale)  # lines go via ON DELETE CASCADE / delete-orphan
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{sale_id}/scan", response_model=ScanResponse)
def scan_into_sale(sale_id: str, body: ScanRequest, db: DbSession) -> ScanResponse:
    """Scan a barcode into the cart.

    Found and already in the cart -> increment that line's qty. Found and new ->
    append with qty 1. Not found -> 404, which is what produces the frontend's
    `Barkode "<code>" tidak ditemukan`.

    Price is snapshotted at FIRST scan, not at checkout: if the catalog price
    changes while a cart is parked, the parked line keeps the old price. That is
    the intent, though it means a cart parked for days sells at a stale price.
    """
    sale = _load_sale(db, sale_id)
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
        sale=_out(_load_sale(db, sale_id)),
        scanned_line_id=str(outcome["line_id"]),
        created=bool(outcome["created"]),
    )


@router.patch("/{sale_id}/lines/{line_id}", response_model=OpenSaleOut)
def set_line_qty(
    sale_id: str, line_id: str, body: SetQtyRequest, db: DbSession
) -> OpenSaleOut:
    """Set a line's qty. qty <= 0 DELETEs the line rather than clamping to 0, which
    matches setLineQty and keeps this consistent with ck_osl_qty_positive."""
    sale = _load_sale(db, sale_id)
    line = _find_line(sale, line_id)

    if body.qty <= 0:
        db.delete(line)
    else:
        line.qty = body.qty
    db.commit()
    db.expire_all()
    return _out(_load_sale(db, sale_id))


@router.delete("/{sale_id}/lines/{line_id}", response_model=OpenSaleOut)
def remove_line(sale_id: str, line_id: str, db: DbSession) -> OpenSaleOut:
    sale = _load_sale(db, sale_id)
    db.delete(_find_line(sale, line_id))
    db.commit()
    db.expire_all()
    return _out(_load_sale(db, sale_id))


def _find_line(sale: OpenSale, line_id: str) -> OpenSaleLine:
    for line in sale.lines:
        if line.id == line_id:
            return line
    raise line_not_found()
