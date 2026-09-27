from __future__ import annotations

from typing import Annotated

from pydantic import Field, StringConstraints

from .common import CamelModel, UtcDateTime

# Non-empty after stripping, mirroring the frontend's handleSave validation.
Barcode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
ProductName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class ProductOut(CamelModel):
    """Matches frontend/lib/types.ts Product exactly."""

    id: str
    barcode: str
    name: str
    price: int
    updated_at: UtcDateTime
    updated_by: str


class ProductCreate(CamelModel):
    barcode: Barcode
    name: ProductName
    # Integer rupiah, always positive -- mirrors ck_products_price_positive.
    price: int = Field(gt=0)

    # Note: updatedBy is NOT accepted here. It is resolved from X-Cashier-Id, so a
    # client cannot claim to be someone else (spec 3.2).


class ProductUpdate(CamelModel):
    barcode: Barcode | None = None
    name: ProductName | None = None
    price: int | None = Field(default=None, gt=0)


class ProductBackupRow(CamelModel):
    """One product row in a backup file. Superset of ProductOut: adds id,
    isActive and createdAt so a restore is byte-for-byte faithful."""

    id: str
    barcode: Barcode
    name: ProductName
    price: int = Field(gt=0)
    is_active: bool
    updated_by: str
    created_at: UtcDateTime
    updated_at: UtcDateTime


class ProductBackupFile(CamelModel):
    """The whole export envelope. Versioned so a future format change can
    reject an old file instead of guessing at its shape."""

    format_version: int = 1
    exported_at: UtcDateTime
    product_count: int
    products: list[ProductBackupRow]


class ProductImportResult(CamelModel):
    imported: int
    active: int
    inactive: int
