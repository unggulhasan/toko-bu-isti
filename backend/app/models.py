from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Sequence,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from .types import UUIDStr


def _uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    # Firebird has no ON UPDATE clause, so `onupdate` is applied by SQLAlchemy in
    # Python on flush. Raw SQL updates bypass it and must set updated_at themselves.
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        nullable=False,
    )


class TransactionStatus(str, enum.Enum):
    completed = "completed"
    voided = "voided"


# NOTE: there is no register/terminal entity anywhere in this schema. The cashier
# is the only actor identified. See spec 1.6.


class Cashier(Base, TimestampMixin):
    """Replaces the hardcoded CASHIERS map in session-store.ts.

    The 4-digit PIN both authenticates and *identifies* -- it selects which
    cashier is signed in.
    """

    __tablename__ = "cashiers"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(80), nullable=False)

    # The PIN is a lookup key, so it must be unique across active cashiers and
    # queryable -- which rules out a per-row salted hash (you cannot look one up
    # without scanning every cashier and verifying each). Stored as-is; spec 3.0
    # explains why that is acceptable here and what to change if it stops being.
    pin: Mapped[str] = mapped_column(String(8), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Same nullable-column trick as products: PIN unique among active cashiers
    # only, so a retired cashier's PIN can be reissued.
    pin_active: Mapped[str | None] = mapped_column(String(8))

    __table_args__ = (UniqueConstraint("pin_active", name="uq_cashiers_pin_live"),)


# NOTE: there is no `Session` / `pos_sessions` table. The frontend holds the
# session in localStorage; the server is stateless with respect to login (spec 3.0).


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    barcode: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    # Integer rupiah. Never Float and never DOUBLE PRECISION.
    price: Mapped[int] = mapped_column(BigInteger, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Firebird has no partial unique index. This nullable column is the standard
    # substitute: it holds `barcode` while the row is live and NULL once
    # soft-deleted, and Firebird's UNIQUE allows unlimited NULLs. Maintained by the
    # app and by the products_bi_bu trigger in schema.sql.
    barcode_active: Mapped[str | None] = mapped_column(String(64))

    # Maps to Product.updatedBy -- denormalized so a receipt/audit view does not
    # need a join, and survives the cashier being deactivated.
    updated_by: Mapped[str] = mapped_column(String(80), nullable=False)

    __table_args__ = (
        UniqueConstraint("barcode_active", name="uq_products_barcode_live"),
        CheckConstraint("price > 0", name="ck_products_price_positive"),
        # Exact-match scan lookups.
        Index("ix_products_barcode", "barcode"),
        # Case-insensitive name search -- emitted as COMPUTED BY (upper(name)).
        # Note the column object, NOT the string "name": func.upper("name") would
        # index the literal 'NAME' and silently never match anything.
        Index("ix_products_name_upper", func.upper(name)),
    )


class OpenSale(Base, TimestampMixin):
    """A parked, unpaid cart. Several are open at once, but each belongs to the
    cashier who created it -- two registers signed in as different cashiers must
    not see (or scan into) each other's carts. A cart is still resumable on any
    machine by logging in with the same PIN."""

    __tablename__ = "open_sales"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    # Nullable because rows that predate this column have no owner; those are
    # visible to nobody (see app/migrations.py). SET NULL rather than CASCADE for
    # the same reason as transactions.cashier_id: deleting a cashier must not
    # silently destroy a parked cart.
    cashier_id: Mapped[str | None] = mapped_column(
        ForeignKey("cashiers.id", ondelete="SET NULL"), index=True
    )
    # Stable ordering for the OpenSalesStrip tabs and for `,` / `.` cycling. The
    # strip labels tabs by 1-based position, so order must be deterministic.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)

    lines: Mapped[list["OpenSaleLine"]] = relationship(
        back_populates="sale",
        cascade="all, delete-orphan",
        order_by="OpenSaleLine.position",
    )


class OpenSaleLine(Base):
    __tablename__ = "open_sale_lines"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    sale_id: Mapped[str] = mapped_column(
        ForeignKey("open_sales.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL")
    )

    # Snapshots taken at scan time.
    barcode: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    sale: Mapped[OpenSale] = relationship(back_populates="lines")

    __table_args__ = (
        # Rescanning a barcode already in the cart must bump qty, not append a
        # duplicate line (see sales-store.ts scanBarcode).
        UniqueConstraint("sale_id", "barcode", name="uq_osl_sale_barcode"),
        # qty is always >= 1 here: PATCH .../lines/{id} with qty <= 0 DELETEs the
        # row rather than storing it, so this constraint and that endpoint agree.
        CheckConstraint("qty > 0", name="ck_osl_qty_positive"),
    )


# One shop-wide receipt counter (spec 1.6). Firebird generators are lock-free,
# which is why the counter is a sequence and not a locked row (spec 2.3).
sale_number_seq = Sequence("gen_sale_number", metadata=Base.metadata)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)

    # Allocated from gen_sale_number inside the checkout transaction. Non-null for
    # every committed transaction -- the frontend's `number | null` reflects only
    # its inability to allocate one locally.
    sale_number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)

    cashier_id: Mapped[str | None] = mapped_column(
        ForeignKey("cashiers.id", ondelete="SET NULL")
    )
    # Denormalized for the receipt -- must not change if the cashier is later
    # renamed or deactivated. There is no terminal/register column (spec 1.6).
    cashier_name: Mapped[str] = mapped_column(String(80), nullable=False)

    total: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tendered: Mapped[int] = mapped_column(BigInteger, nullable=False)
    change: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # native_enum=False -> VARCHAR + CHECK. Firebird has no native ENUM type.
    status: Mapped[TransactionStatus] = mapped_column(
        Enum(TransactionStatus, native_enum=False, length=16),
        default=TransactionStatus.completed,
        nullable=False,
    )

    # No index=True here: the explicit ix_txn_created in __table_args__ covers this
    # column, and both would emit two identical indexes.
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime)
    voided_by: Mapped[str | None] = mapped_column(String(80))

    lines: Mapped[list["TransactionLine"]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan",
        order_by="TransactionLine.position",
    )

    __table_args__ = (
        # Serves the transactions list and the daily stat strip; every query on it
        # is newest-first.
        Index("ix_txn_created", "created_at"),
        CheckConstraint("tendered >= total", name="ck_txn_tender_covers_total"),
        # `change` is derived, so pin it to its definition rather than trusting
        # every future write path to compute it the same way.
        CheckConstraint("change = tendered - total", name="ck_txn_change_derived"),
    )


class TransactionLine(Base):
    """Immutable once written -- a receipt must never change retroactively."""

    __tablename__ = "transaction_lines"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    transaction_id: Mapped[str] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL")
    )

    barcode: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    # price * qty, stored so historical totals never drift.
    line_total: Mapped[int] = mapped_column(BigInteger, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    transaction: Mapped[Transaction] = relationship(back_populates="lines")
