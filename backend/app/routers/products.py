"""Product catalog. All routes are `def`, never `async def` (spec 2.0)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Body, Query, Response, status
from pydantic import ValidationError
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..dependencies import CurrentCashier, DbSession
from ..errors import (
    barcode_taken,
    import_invalid,
    import_version_unsupported,
    product_not_found,
)
from ..models import Product
from ..schemas.common import Page, paginate
from ..schemas.product import (
    ProductBackupFile,
    ProductBackupRow,
    ProductCreate,
    ProductImportResult,
    ProductOut,
    ProductUpdate,
)

router = APIRouter(prefix="/products", tags=["products"])


def _containing(column, needle: str):
    """Firebird CONTAINING: case-insensitive substring match in one operator.

    This is exactly the frontend's `name.toLowerCase().includes(q)`. A plain LIKE
    would NOT work -- Firebird's LIKE is case-sensitive by default. CONTAINING
    cannot use an index; fine for a catalog of a few thousand, and spec 2.2
    documents the UNICODE_CI collation route if it ever outgrows a scan.
    """
    return column.op("CONTAINING")(needle)


def _tokens(q: str) -> list[str]:
    """Split a search query into words so "djarum slop" matches "djarum 12
    slop" -- a single CONTAINING(q) would require that exact contiguous
    substring, which a word in between defeats."""
    return q.split()


def _is_barcode_conflict(exc: DBAPIError) -> bool:
    """Recognize a uq_products_barcode_live violation.

    Two Firebird/dialect specifics: the constraint name comes back UPCASED, and
    sqlalchemy-firebird raises DBAPIError (DatabaseError), not IntegrityError -- so
    catching IntegrityError here would let every duplicate become a 500.
    """
    return "UQ_PRODUCTS_BARCODE_LIVE" in f"{exc.orig}".upper()


# NOTE: /barcode/{barcode} and /search are declared BEFORE /{product_id}, or
# FastAPI would match "barcode" and "search" as an id.


@router.get("", response_model=Page[ProductOut])
def list_products(
    db: DbSession,
    q: Annotated[str | None, Query()] = None,
    # 0-based, matching the frontend's `page` state.
    page: Annotated[int, Query(ge=0)] = 0,
    page_size: Annotated[int, Query(ge=1, le=200, alias="pageSize")] = 8,
    include_inactive: Annotated[bool, Query(alias="includeInactive")] = False,
) -> Page[ProductOut]:
    """Paginated, searchable catalog list. `total` drives "Menampilkan {n} dari {total}"."""
    filters = []
    if not include_inactive:
        filters.append(Product.is_active)
    if q:
        for token in _tokens(q):
            filters.append(
                or_(_containing(Product.name, token), _containing(Product.barcode, token))
            )

    total = db.scalar(select(func.count()).select_from(Product).where(*filters)) or 0
    rows = db.scalars(
        select(Product)
        .where(*filters)
        .order_by(Product.name)
        # .limit()/.offset() are correct: the dialect emits Firebird's
        # OFFSET ... FETCH form, not LIMIT.
        .limit(page_size)
        .offset(page * page_size)
    ).all()

    return paginate(
        [ProductOut.model_validate(r) for r in rows], total, page, page_size
    )


@router.get("/barcode/{barcode}", response_model=ProductOut)
def get_by_barcode(barcode: str, db: DbSession) -> ProductOut:
    """The hot path for every scan: one exact match on an indexed column.

    The 404 is what produces the frontend's `Barkode "<code>" tidak ditemukan`.
    """
    product = db.scalar(
        select(Product).where(Product.barcode == barcode, Product.is_active)
    )
    if product is None:
        raise product_not_found(barcode)
    return ProductOut.model_validate(product)


@router.get("/search", response_model=list[ProductOut])
def search_products(
    db: DbSession,
    q: Annotated[str, Query(min_length=1)],
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[ProductOut]:
    """Backs ProductSearchDialog. Name only -- the dialog does not search barcodes.
    Default limit 10 matches its MAX_RESULTS."""
    rows = db.scalars(
        select(Product)
        .where(Product.is_active, *[_containing(Product.name, t) for t in _tokens(q)])
        .order_by(Product.name)
        .limit(limit)
    ).all()
    return [ProductOut.model_validate(r) for r in rows]


@router.get("/export")
def export_products(db: DbSession) -> Response:
    """Full lossless snapshot of every product, active and soft-deleted, as a
    downloadable JSON file. No cashier auth -- read-only, same posture as
    GET /transactions/report.
    """
    rows = db.scalars(select(Product).order_by(Product.barcode)).all()
    payload = ProductBackupFile(
        exported_at=datetime.now(timezone.utc),
        product_count=len(rows),
        products=[ProductBackupRow.model_validate(r) for r in rows],
    )
    body = payload.model_dump_json(by_alias=True, indent=2).encode("utf-8")
    filename = f"produk-cadangan-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.json"
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import", response_model=ProductImportResult)
def import_products(
    cashier: CurrentCashier,
    db: DbSession,
    body: Annotated[bytes, Body()],
) -> ProductImportResult:
    """Wholesale replace of the products table from a previously exported
    backup file. Validated in full before any row is deleted; the delete and
    the bulk insert happen in one transaction so a failure midway rolls back
    to the pre-import state.

    The request must NOT be sent with a `application/json` Content-Type: with
    that header FastAPI parses the body as JSON before this parameter ever
    sees it, handing a `dict` where a `bytes` was declared, and the request
    fails with a 422 before this function runs. Send it as
    `application/octet-stream` (or omit Content-Type) so FastAPI hands over
    the raw, unparsed bytes instead -- this endpoint parses the JSON itself,
    below, so it can distinguish "not JSON" from "valid JSON, wrong shape".
    """
    try:
        data: Any = json.loads(body)
    except ValueError as exc:
        raise import_invalid([{"msg": f"JSON tidak valid: {exc}"}]) from exc

    try:
        backup = ProductBackupFile.model_validate(data)
    except ValidationError as exc:
        raise import_invalid(exc.errors()) from exc

    if backup.format_version != 1:
        raise import_version_unsupported(backup.format_version)

    # Mirrors uq_products_barcode_live: catch a bad file in validation rather
    # than let it surface as an opaque constraint violation mid-insert.
    seen_active_barcodes: set[str] = set()
    for row in backup.products:
        if row.is_active:
            if row.barcode in seen_active_barcodes:
                raise import_invalid([{"msg": f"Barkode aktif ganda: {row.barcode}"}])
            seen_active_barcodes.add(row.barcode)

    try:
        db.execute(delete(Product))
        for row in backup.products:
            db.add(
                Product(
                    id=row.id,
                    barcode=row.barcode,
                    name=row.name,
                    price=row.price,
                    is_active=row.is_active,
                    # barcode_active intentionally left unset -- the
                    # products_bi_bu trigger sets it BEFORE INSERT regardless
                    # of insert path.
                    updated_by=row.updated_by,
                    created_at=row.created_at.replace(tzinfo=None),
                    updated_at=row.updated_at.replace(tzinfo=None),
                )
            )
        db.commit()
    except DBAPIError:
        db.rollback()
        raise

    active = sum(1 for r in backup.products if r.is_active)
    return ProductImportResult(
        imported=len(backup.products), active=active, inactive=len(backup.products) - active
    )


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    body: ProductCreate, cashier: CurrentCashier, db: DbSession
) -> ProductOut:
    product = Product(
        barcode=body.barcode,
        name=body.name,
        price=body.price,
        is_active=True,
        # Kept in sync in Python as well as by the products_bi_bu trigger, so the
        # ORM's view of the row matches the database's.
        barcode_active=body.barcode,
        updated_by=cashier.name,
    )
    db.add(product)
    try:
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        # Detected by catching the constraint violation rather than pre-checking,
        # so two concurrent creates cannot both pass a check (spec 3.2).
        if _is_barcode_conflict(exc):
            raise barcode_taken(body.barcode) from exc
        raise
    return ProductOut.model_validate(product)


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: str, body: ProductUpdate, cashier: CurrentCashier, db: DbSession
) -> ProductOut:
    product = _live_product(db, product_id)

    if body.barcode is not None:
        product.barcode = body.barcode
        product.barcode_active = body.barcode
    if body.name is not None:
        product.name = body.name
    if body.price is not None:
        product.price = body.price
    product.updated_by = cashier.name
    # updated_at is handled by TimestampMixin.onupdate -- this is an ORM flush.

    try:
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        if _is_barcode_conflict(exc):
            raise barcode_taken(body.barcode or product.barcode) from exc
        raise
    return ProductOut.model_validate(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: str, db: DbSession) -> Response:
    """Soft delete. Never a hard delete: transaction lines reference product_id, and
    a historical receipt must survive a catalog deletion (spec 1.4).

    Setting is_active = false makes the trigger null barcode_active, which frees the
    barcode for reuse by a new product.
    """
    product = _live_product(db, product_id)
    product.is_active = False
    product.barcode_active = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _live_product(db: Session, product_id: str) -> Product:
    product = db.scalar(
        select(Product).where(Product.id == product_id, Product.is_active)
    )
    if product is None:
        raise product_not_found(product_id)
    return product
