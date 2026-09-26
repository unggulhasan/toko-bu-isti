# Backend Specification — Toko Bu Isti POS

Derived from the Next.js frontend in `frontend/`. The frontend currently runs entirely on
Zustand stores persisted to `localStorage` with seeded fixtures. This document specifies the
FastAPI + SQLAlchemy backend needed to replace those fixtures with real persistence.

**Database: Firebird 5.0+**, via the external `sqlalchemy-firebird` dialect on top of
`firebird-driver`. Firebird differs enough from Postgres/MySQL in ways that reach the schema —
no partial indexes, generators instead of row-locked counters, `CONTAINING` for
case-insensitive search, `ROWS`/`OFFSET` pagination, and a synchronous-only driver — that
§2.0 and §2.2 below are required reading before writing any model code.

---

## 1. Summary

### 1.1 What the app is

A single-store, keyboard-first point-of-sale ("kasir") for a small Indonesian retail shop.
The UI is in Indonesian, currency is IDR (integer rupiah, no decimals), and the whole flow is
built around a barcode scanner feeding one always-focused input field.

Three screens behind a password gate:

| Route | Screen | Purpose |
| --- | --- | --- |
| `/login` | Login | Single shared cashier password, sets an `httpOnly` `pos_session` cookie |
| `/` | Kasir (checkout) | Scan items into a cart, park multiple carts, take cash payment |
| `/products` | Produk | CRUD product catalog, search by name/barcode, paginated 8/page |
| `/transactions` | Transaksi | Day's transaction list, receipt detail, void, reprint, stat strip |

### 1.2 Core domain concepts

Four entities, mapping directly to `frontend/lib/types.ts`:

- **Product** — catalog item keyed by `barcode`. Fields: `barcode`, `name`, `price`, plus audit
  `updatedAt` / `updatedBy`.
- **OpenSale** — a parked, unpaid cart. The register holds *several simultaneously*; the cashier
  cycles between them with `,` / `.` / `F3`. Currently persisted client-side under
  `pos:open-sales`. This is the concept most in need of server ownership, since a parked cart
  must survive a browser refresh or a move to another terminal.
- **SaleLine** — a line inside a cart or a committed transaction: `productId`, `barcode`, `name`,
  `price`, `qty`. Note that `barcode`, `name` and `price` are **denormalized snapshots** — a
  receipt must show the price charged at the time, not today's catalog price. The backend must
  preserve this.
- **Transaction** — a committed sale: the lines, `total`, `tendered`, `change`, `cashierName`,
  `registerId`, `createdAt`, and `status` of `completed` | `voided`. Voiding is a soft state
  change, never a delete.

### 1.3 Behaviors the backend must support

**Scanning.** `scanBarcode` looks up a product by exact barcode. Found → increment the existing
line's qty if that barcode is already in the cart, else append a new line with qty 1. Not found →
the UI shows `Barkode "<code>" tidak ditemukan`. The backend needs a fast exact-match barcode
lookup and should return a clear 404 for misses so the frontend can render that message.

**Sale numbering.** `Transaction.saleNumber` is `number | null` and the frontend currently commits
with `saleNumber: null` — it has no way to allocate one. Seeded transactions show `1042`, `1041`,
etc. **This is a gap the backend must close**: the server assigns a monotonically increasing sale
number per register on commit. The receipt panel and transaction table both render `#{saleNumber}`
and fall back to `—`, so this is visibly broken until the backend owns it.

**Payment.** Cash only. `change = tendered - total`; confirm is blocked while `tendered < total`.
Server must recompute `total` from the lines rather than trusting the client, and reject
`tendered < total`.

**Void.** Flips `status` to `voided`. Voided transactions are excluded from the stat strip's
`salesCount`, `gross` and `cashInDrawer`, and counted separately as `voidedCount`. Already-voided
transactions cannot be voided again (the button is disabled client-side; enforce server-side too).

**Stats.** The transactions page computes four figures over the day's transactions. With
server-side pagination these can no longer be derived from the loaded page, so they need a
dedicated summary endpoint.

**Session.** `cashierName` ("ShitaMira") and `registerId` ("01") are hardcoded in
`session-store.ts` and stamped onto every transaction. The mock password is `kasir123`,
hardcoded in a server action. The backend should own both: a real cashier record and a real
register, so `cashierName` on a receipt reflects who was actually signed in.

### 1.4 Notable gaps between the current frontend and a real backend

These are places where the frontend's local-only design will need adjustment once the API lands.
Flagging them here rather than silently designing around them:

1. **`saleNumber` is never assigned** — as above, server-allocated on commit.
2. **Line IDs are `Date.now()`-based** — `l-${Date.now()}` collides if two lines are added inside
   the same millisecond. Server-generated IDs fix this.
3. **Products are deleted hard** — `deleteProduct` filters the array. But transaction lines
   reference `productId`. The schema below uses `ON DELETE SET NULL` on the line's FK plus a
   soft-delete `is_active` flag, so historical receipts survive a catalog deletion. Firebird
   has no partial unique index, so "barcode unique among live products only" needs the
   workaround in §2.2.
4. **Price is `number`** — JS floats for currency. Rupiah is integral and `formatRupiah` already
   rounds, so the backend stores `BIGINT` rupiah. Never `Float` and never Firebird's
   `DOUBLE PRECISION`.
5. **Client-side pagination** — `/products` slices all products in memory. The endpoints below
   are paginated; the frontend will need to pass `page`/`page_size` through.
6. **No optimistic-concurrency on products** — two cashiers editing the same product silently
   clobber. `updated_at` is returned and can be used as an `If-Unmodified-Since`-style guard later
   if it matters; not specified as required now.

### 1.5 Conventions

- **Base path**: `/api`
- **Case**: JSON bodies and responses use `camelCase` to match the existing TS types; SQLAlchemy
  columns use `snake_case`. Configure Pydantic with `alias_generator=to_camel,
  populate_by_name=True`.
- **IDs**: server-generated UUID strings, stored as `CHAR(36) CHARACTER SET OCTETS` (see §2.2 —
  octets avoids charset/collation overhead on a column that is pure ASCII hex). The frontend
  types already declare `id: string`, so existing code needs no type change.
- **Timestamps**: ISO-8601 UTC strings, matching `new Date().toISOString()`.
- **Money**: integer rupiah.
- **Auth**: the existing `pos_session` cookie. The backend issues it on login and validates it on
  every other route.
- **Errors**: `{ "detail": { "code": "PRODUCT_NOT_FOUND", "message": "..." } }`.

---

## 2. Database layer (Firebird 5)

### 2.0 Dialect, driver and connection

SQLAlchemy **dropped its built-in Firebird dialect in 1.4**. Firebird support now comes from the
externally maintained `sqlalchemy-firebird` package (2.2.0 at time of writing), which targets
SQLAlchemy 2.0+ and Firebird 3.0+ and sits on the modern `firebird-driver` DB-API module.

```
firebird+firebird://SYSDBA:masterkey@localhost:3050/C:/data/tokobuisti.fdb
firebird+firebird://SYSDBA:masterkey@localhost:3050//var/lib/firebird/data/tokobuisti.fdb
```

Note the doubled slash in the POSIX form — the path after the host is absolute, so the URL needs
`//` to express a leading `/`. An alias declared in `databases.conf` is the more maintainable
option:

```
firebird+firebird://SYSDBA:masterkey@localhost:3050/tokobuisti
```

```python
# backend/app/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine(
    settings.database_url,
    # Firebird's server-side statement cache is per-connection and the classic
    # architecture spawns a process per connection. Keep the pool modest.
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,       # drops connections the server has already reaped
    pool_recycle=1800,
    connect_args={"charset": "UTF8"},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
```

**Synchronous only.** `firebird-driver` is a blocking DB-API module and there is no asyncio
Firebird dialect. Define routes as `def` rather than `async def` so FastAPI runs them in its
threadpool; an `async def` route making blocking DB calls will stall the event loop. This is a
change in shape from the typical FastAPI + asyncpg setup, and it is the single most important
thing to get right at the start.

**Transaction isolation.** Firebird is MVCC with a default of `SNAPSHOT` (repeatable read) in
many tools, but SQLAlchemy's dialect uses `READ COMMITTED`. Keep `READ COMMITTED` — the checkout
path in §2.3 depends on seeing other transactions' committed generator values. Firebird raises
`deadlock` / `lock conflict` on write-write conflicts rather than blocking indefinitely, so
write paths need a retry (§2.3).

**Character set.** Create the database `DEFAULT CHARACTER SET UTF8`. Product names carry
Indonesian text. Be aware that in Firebird a `VARCHAR(160)` in UTF8 reserves 4 bytes per
character internally, and index keys are capped at roughly 1/4 of the page size — with an 8 KB
page that is ~2048 bytes, so a UTF8 `VARCHAR(160)` index key (640 bytes) is comfortable but a
much wider indexed text column would not be. Create the database with **page size 8192 or
16384**.

### 2.1 SQLAlchemy models

SQLAlchemy 2.0 declarative style with `Mapped` / `mapped_column`.

```python
# backend/app/models.py
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

from .types import UUIDStr  # CHAR(36) CHARACTER SET OCTETS — see §2.2


def _uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    # Firebird has no ON UPDATE clause, so `onupdate` is applied by SQLAlchemy in
    # Python on flush. Raw SQL updates bypass it — see §2.2.
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


class Register(Base, TimestampMixin):
    """A physical till. `code` is the "01" shown in the header and on receipts."""

    __tablename__ = "registers"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # NOTE: no `next_sale_number` column. Under Firebird the receipt counter is a
    # GENERATOR, not a locked row — see §2.3.

    open_sales: Mapped[list["OpenSale"]] = relationship(back_populates="register")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="register")


class Cashier(Base, TimestampMixin):
    """Replaces the hardcoded `cashierName` in session-store.ts."""

    __tablename__ = "cashiers"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # Shared-password model today; per-cashier PIN is the natural upgrade path.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    sessions: Mapped[list["Session"]] = relationship(back_populates="cashier")


class Session(Base):
    """Backs the existing httpOnly `pos_session` cookie."""

    __tablename__ = "pos_sessions"  # SESSION is near-reserved; avoid the fight

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    token: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )

    cashier_id: Mapped[str] = mapped_column(
        ForeignKey("cashiers.id", ondelete="CASCADE"), nullable=False
    )
    register_id: Mapped[str] = mapped_column(
        ForeignKey("registers.id", ondelete="CASCADE"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)

    cashier: Mapped[Cashier] = relationship(back_populates="sessions")
    register: Mapped[Register] = relationship()


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    barcode: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    # Integer rupiah. Never Float — see §1.4.
    price: Mapped[int] = mapped_column(BigInteger, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Firebird has no partial unique index. This nullable computed-ish column is
    # the standard substitute: it holds `barcode` while the row is live and NULL
    # once soft-deleted, and Firebird's UNIQUE allows unlimited NULLs. Maintained
    # by the app (and the trigger in §2.2) alongside `is_active`.
    barcode_active: Mapped[str | None] = mapped_column(String(64))

    # Maps to Product.updatedBy — denormalized so a receipt/audit view does not
    # need a join, and survives the cashier being deactivated.
    updated_by: Mapped[str] = mapped_column(String(80), nullable=False)

    __table_args__ = (
        UniqueConstraint("barcode_active", name="uq_products_barcode_live"),
        CheckConstraint("price > 0", name="ck_products_price_positive"),
        # Exact-match scan lookups.
        Index("ix_products_barcode", "barcode"),
        # Case-insensitive name search. Firebird cannot use a plain index for
        # CONTAINING, so this is an expression index on UPPER(name) paired with
        # the query form in §2.2.
        Index("ix_products_name_upper", func.upper("name")),
    )


class OpenSale(Base, TimestampMixin):
    """A parked, unpaid cart. Several are open per register at once."""

    __tablename__ = "open_sales"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    register_id: Mapped[str] = mapped_column(
        ForeignKey("registers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Stable ordering for the OpenSalesStrip tabs and for `,` / `.` cycling.
    # The strip labels tabs by 1-based position, so order must be deterministic.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    register: Mapped[Register] = relationship(back_populates="open_sales")
    lines: Mapped[list["OpenSaleLine"]] = relationship(
        back_populates="sale",
        cascade="all, delete-orphan",
        order_by="OpenSaleLine.position",
    )

    __table_args__ = (
        Index("ix_open_sales_reg_pos", "register_id", "position"),
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
        CheckConstraint("qty > 0", name="ck_osl_qty_positive"),
    )


# Per-register receipt counters are generators created at register-creation time
# (see §2.3). This declares the fallback/default one so Alembic and create_all
# emit it; additional registers get theirs via `CREATE SEQUENCE` at runtime.
sale_number_seq = Sequence("gen_sale_number_01", metadata=Base.metadata)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)

    # Allocated from the register's generator inside the checkout transaction.
    # Non-null for every committed transaction — the frontend's `number | null`
    # reflects only its inability to allocate one locally.
    sale_number: Mapped[int] = mapped_column(Integer, nullable=False)

    register_id: Mapped[str] = mapped_column(
        ForeignKey("registers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    cashier_id: Mapped[str | None] = mapped_column(
        ForeignKey("cashiers.id", ondelete="SET NULL")
    )
    # Denormalized for the receipt — must not change if the cashier is renamed.
    cashier_name: Mapped[str] = mapped_column(String(80), nullable=False)
    register_code: Mapped[str] = mapped_column(String(8), nullable=False)

    total: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tendered: Mapped[int] = mapped_column(BigInteger, nullable=False)
    change: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # native_enum=False -> VARCHAR + CHECK. Firebird has no native ENUM type.
    status: Mapped[TransactionStatus] = mapped_column(
        Enum(TransactionStatus, native_enum=False, length=16),
        default=TransactionStatus.completed,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False, index=True
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime)
    voided_by: Mapped[str | None] = mapped_column(String(80))

    register: Mapped[Register] = relationship(back_populates="transactions")
    lines: Mapped[list["TransactionLine"]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan",
        order_by="TransactionLine.position",
    )

    __table_args__ = (
        UniqueConstraint("register_id", "sale_number", name="uq_txn_reg_sale_no"),
        # Serves the transactions list and the daily stat strip. DESC because
        # every query on it is newest-first.
        Index("ix_txn_reg_created", "register_id", "created_at"),
        CheckConstraint("tendered >= total", name="ck_txn_tender_covers_total"),
    )


class TransactionLine(Base):
    """Immutable once written — a receipt must never change retroactively."""

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
```

### 2.2 Firebird-specific schema notes

These are the places where Firebird forced a design different from the Postgres-shaped default.

**No partial unique indexes.** Postgres would express "barcode unique among live products" as
`UNIQUE (barcode) WHERE is_active`. Firebird has no such thing. The `barcode_active` column is
the standard substitute: Firebird's `UNIQUE` permits unlimited `NULL`s, so holding the barcode
while live and `NULL` once deleted gives exactly the intended constraint. Keep it in sync with a
trigger so a stray raw `UPDATE` cannot desynchronize it:

```sql
CREATE TRIGGER products_bi_bu FOR products
ACTIVE BEFORE INSERT OR UPDATE POSITION 0
AS BEGIN
  NEW.barcode_active = IIF(NEW.is_active, NEW.barcode, NULL);
END
```

**Identifier length is 63 characters** on Firebird 4.0+ (it was 31 on 3.0). Every constraint and
index name above is well inside that, but the names were shortened from the Postgres draft —
`uq_txn_register_sale_number` became `uq_txn_reg_sale_no` — to leave headroom. Do not let
Alembic autogenerate long implicit names.

**A UUID PK type.** Firebird has no `UUID` type. Store as `CHAR(36) CHARACTER SET OCTETS`:

```python
# backend/app/types.py
from sqlalchemy import CHAR
from sqlalchemy.dialects import registry  # noqa: F401
from sqlalchemy_firebird.types import FBCHAR

# CHAR(36) with OCTETS charset: no collation work on a pure-ASCII hex column,
# and 36 bytes rather than 144 under a UTF8 default charset.
UUIDStr = FBCHAR(36, charset="OCTETS")
```

If you prefer to stay dialect-agnostic in the models, `String(36)` also works and costs a little
more space under a UTF8 database. `CHAR` is fixed-width, so trailing-space semantics apply —
UUIDs are always exactly 36 chars, so this is safe here but would not be for variable-length keys.

**Case-insensitive search needs care.** Firebird's `LIKE` is case-**sensitive** by default, so
the frontend's `p.name.toLowerCase().includes(q)` does not translate to a plain `LIKE`. Two
options:

```sql
-- CONTAINING is case-insensitive and reads naturally, but cannot use an index.
WHERE name CONTAINING :q

-- Indexed alternative, matching ix_products_name_upper:
WHERE UPPER(name) LIKE UPPER(:q) || '%'      -- prefix: uses the index
WHERE UPPER(name) LIKE '%' || UPPER(:q) || '%'  -- substring: full scan
```

A leading `%` defeats the index either way. For a catalog of a few thousand products a scan is
fine; if the catalog grows, declare the column with a case-insensitive collation instead:
`VARCHAR(160) CHARACTER SET UTF8 COLLATE UNICODE_CI`, which makes plain `LIKE`
case-insensitive *and* indexable.

**Pagination is `ROWS`, not `LIMIT`.** Firebird 5 supports both `FIRST n SKIP m` and the
SQL-standard `OFFSET m ROWS FETCH NEXT n ROWS ONLY`. SQLAlchemy's `.limit()` / `.offset()` emit
the correct form through the dialect, so ORM-level paging needs no special handling; only
hand-written SQL does.

**`func.now()` is `CURRENT_TIMESTAMP`.** Note that in Firebird, `CURRENT_TIMESTAMP` has
milliseconds precision and returns the *transaction* start time, not the statement time. For
receipt ordering within a busy second this matters: two transactions committed in the same
database transaction would share a timestamp. They do not here (each checkout is its own
transaction), but sort by `(created_at DESC, sale_number DESC)` rather than `created_at` alone
so ties resolve deterministically.

**`DateTime(timezone=True)` is not supported.** Firebird 4+ does have `TIMESTAMP WITH TIME ZONE`,
but the dialect maps plain `DateTime` to `TIMESTAMP` without zone. Store UTC consistently and
attach `timezone.utc` in the Pydantic layer when serializing, so the ISO strings the frontend
receives still carry a `Z`.

**No `ON UPDATE CURRENT_TIMESTAMP`.** The `TimestampMixin.onupdate` above is applied by
SQLAlchemy in Python, so it only fires on ORM flushes. Any bulk `UPDATE` issued as raw SQL must
set `updated_at` itself, or add a `BEFORE UPDATE` trigger.

**`native_enum=False` is mandatory.** Firebird has no `ENUM`; the status column becomes
`VARCHAR(16)` plus a `CHECK`.

**Boolean is native** in Firebird 3.0+, so `Boolean` maps to the real `BOOLEAN` type — no
`CHAR(1)`/`SMALLINT` emulation needed.

**Cascades.** Firebird fully supports `ON DELETE CASCADE` / `SET NULL` / `RESTRICT` in FK
definitions, so the referential actions in the models above translate directly.

**Snapshot columns are deliberate.** `barcode` / `name` / `price` are duplicated onto every line
because the frontend renders receipts straight from `transaction.lines`. Joining to `products`
at read time would rewrite history the moment a price changes. `line_total` is likewise stored
rather than computed, so a reprint in six months matches the paper original.

### 2.3 Sale numbers: generators, not locked rows

The Postgres-shaped design used `SELECT ... FOR UPDATE` on a `registers.next_sale_number` column.
**Do not do this on Firebird.** Firebird's MVCC raises a `lock conflict` / `deadlock` error on
write-write contention rather than queueing, so a locked counter row turns every concurrent
checkout into an application-level retry. Firebird's native answer is a **generator** (sequence),
which is *outside* transaction control and never blocks:

```sql
CREATE SEQUENCE gen_sale_number_01 START WITH 1043 INCREMENT BY 1;
```

```python
# backend/app/services/sale_numbers.py
from sqlalchemy import Sequence, text

def allocate_sale_number(db, register_code: str) -> int:
    """Atomic, lock-free, and safe under any isolation level."""
    seq_name = f"gen_sale_number_{register_code}"
    return db.execute(text(f"SELECT NEXT VALUE FOR {seq_name} FROM rdb$database")).scalar_one()
```

One generator per register, created when the register is created. `register_code` is validated
against `^[0-9A-Za-z_]{1,8}$` before interpolation — generator names cannot be bound parameters,
so this is the one place a name is formatted into SQL and it must not accept arbitrary input.

**The tradeoff, decided:** generator values are consumed outside transaction control, so a
rolled-back checkout burns its number and the receipt sequence develops gaps — `#1043` may be
followed by `#1045`. **Gaps are accepted for this project** (decision recorded 2026-09-26), which
is both the conventional Firebird approach and the reason a generator is usable here at all.

Two consequences to build around:

- Do not treat `saleNumber` as a count of sales. The transaction count comes from
  `GET /transactions/summary`, never from subtracting sale numbers.
- Do not add a "missing receipt number" alert to any future reconciliation report; gaps are
  expected, not evidence of a lost sale.

If a strictly gapless sequence is ever mandated (a tax-reporting rule change being the likely
trigger), a generator cannot provide it — that would mean a locked counter row plus retry, and
accepting the serialization cost on every checkout.

**Write-path retries.** Because Firebird surfaces contention as an exception, wrap checkout and
the scan upsert in a small retry:

```python
from firebird.driver.types import DatabaseError

def with_retry(fn, attempts: int = 3):
    for i in range(attempts):
        try:
            return fn()
        except DatabaseError as exc:
            msg = str(exc).lower()
            if i == attempts - 1 or not ("deadlock" in msg or "lock conflict" in msg):
                raise
            db.rollback()
```

### 2.4 Migrations

Alembic works against Firebird through the dialect, but **autogenerate is less reliable here**
than on Postgres — reflection of Firebird's `rdb$` system tables does not round-trip every
construct, particularly check constraints, expression indexes and generators. Practical approach:

- Write migrations by hand, or autogenerate and then review every line before committing.
- Generators, the `products_bi_bu` trigger and expression indexes will not be autogenerated at
  all. Put them in explicit `op.execute()` calls.
- Firebird executes DDL transactionally but has a longstanding constraint: **you cannot always
  alter and then use an object in the same transaction**. Keep each migration to one logical DDL
  change, and call `op.execute("COMMIT")` between dependent steps if a migration fails with
  "object in use".
- There is no `CREATE TABLE IF NOT EXISTS`. Guard conditional DDL by querying `rdb$relations`.

An alternative worth considering for a single-store deployment: generate the schema from a
checked-in `schema.sql` and skip Alembic until the first production migration is actually needed.

## 3. API Endpoints

Base path `/api`. Every route except `POST /auth/login` requires a valid `pos_session` cookie and
returns `401 UNAUTHORIZED` without one.

### 3.1 Auth — `/api/auth`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/login` | Exchange password for a session cookie |
| `POST` | `/auth/logout` | Revoke the session, clear the cookie |
| `GET` | `/auth/session` | Current cashier + register — replaces `session-store.ts` |

**`POST /auth/login`**

```jsonc
// request
{ "password": "kasir123", "registerCode": "01" }   // registerCode optional, defaults to "01"

// 200 — also sets: Set-Cookie: pos_session=<token>; HttpOnly; SameSite=Lax; Path=/
{
  "cashier":  { "id": "...", "name": "ShitaMira" },
  "register": { "id": "...", "code": "01", "name": "Kasir Depan" },
  "expiresAt": "2026-09-27T01:00:00Z"
}
```

`401 INVALID_CREDENTIALS` on a wrong password. The existing login server action redirects to
`/login?error=1`; it should now call this endpoint and forward the cookie.

**`GET /auth/session`** returns the same `cashier` / `register` pair. The frontend's
`session-store.ts` should hydrate from this instead of its hardcoded defaults.

### 3.2 Products — `/api/products`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/products` | Paginated + searchable list (Produk page, 8/page) |
| `GET` | `/products/barcode/{barcode}` | Exact barcode lookup for the scanner |
| `GET` | `/products/search?q=` | Name search for the `/cari` dialog, capped at 10 |
| `POST` | `/products` | Create |
| `PATCH` | `/products/{id}` | Update |
| `DELETE` | `/products/{id}` | Soft delete |

**`GET /products`** — query params `q`, `page` (0-based, matching the frontend's `page` state),
`pageSize` (default 8), `includeInactive` (default `false`).

`q` matches `name` case-insensitively **or** `barcode` as a substring — mirroring the existing
filter:
```ts
p.name.toLowerCase().includes(q) || p.barcode.includes(q)
```
On Firebird this becomes `name CONTAINING :q OR barcode CONTAINING :q` (`CONTAINING` is
case-insensitive and substring-matching in one operator, which is exactly `.includes()` on a
lowercased string). It cannot use an index — see §2.2 for the indexed alternative if the catalog
outgrows a scan.

```jsonc
// 200
{
  "items": [
    {
      "id": "p-8041520094",
      "barcode": "8041520094",
      "name": "Mug Keramik Sand",
      "price": 95000,
      "updatedAt": "2026-09-12T00:00:00Z",
      "updatedBy": "D. Lestari"
    }
  ],
  "total": 42,       // drives "Menampilkan {n} dari {total}"
  "page": 0,
  "pageSize": 8,
  "pageCount": 6
}
```

**`GET /products/barcode/{barcode}`** — the hot path for every scan. Exact match on an indexed
column; `404 PRODUCT_NOT_FOUND` when missing, which is what produces
`Barkode "<code>" tidak ditemukan`.

**`GET /products/search?q=`** — backs `ProductSearchDialog`. Name-only match (the dialog does not
search barcodes), `limit` default 10 to match `MAX_RESULTS`. Emits
`SELECT FIRST 10 ... WHERE name CONTAINING :q`.

**`POST /products`**

```jsonc
// request — updatedBy comes from the session, not the client
{ "barcode": "8041520233", "name": "Wajan Besi Tuang 25 cm", "price": 285000 }
```
`201` with the created product. `409 BARCODE_TAKEN` if a live product already holds that barcode
— detect this by catching the `uq_products_barcode_live` violation rather than pre-checking, so
two concurrent creates cannot both pass the check. Validation mirrors `handleSave`: non-empty
`barcode`, non-empty `name`, `price > 0`.

**`PATCH /products/{id}`** — partial body of the same shape; `200` with the updated product,
`404` / `409` as above.

**`DELETE /products/{id}`** — sets `is_active = false` (the trigger nulls `barcode_active`,
freeing the barcode for reuse), returns `204`.

### 3.3 Open sales (carts) — `/api/open-sales`

These replace the `pos:open-sales` localStorage slice. All are scoped to the session's register.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/open-sales` | All parked carts for this register |
| `POST` | `/open-sales` | New empty cart (`/baru`) |
| `GET` | `/open-sales/{id}` | One cart |
| `DELETE` | `/open-sales/{id}` | Discard a cart (`/hapus`) |
| `POST` | `/open-sales/{id}/scan` | Scan a barcode into the cart |
| `PATCH` | `/open-sales/{id}/lines/{lineId}` | Set a line's qty |
| `DELETE` | `/open-sales/{id}/lines/{lineId}` | Remove a line |

**Shared cart shape** (matches `OpenSale`, with server-computed totals so the client need not
recompute for the summary panel):

```jsonc
{
  "id": "s-1",
  "createdAt": "2026-09-26T07:12:00Z",
  "position": 0,
  "lines": [
    {
      "id": "l-1",
      "productId": "p-8041520233",
      "barcode": "8041520233",
      "name": "Wajan Besi Tuang 25 cm",
      "price": 285000,
      "qty": 1
    }
  ],
  "total": 285000,
  "units": 1,
  "lineCount": 1
}
```

**`GET /open-sales`** returns `{ "items": [...] }` ordered by `position`. If the register has no
carts, the server creates and returns one empty cart — the frontend always assumes at least one
active sale exists (`removeActiveSale` falls back to `makeEmptySale()`).

**`POST /open-sales/{id}/scan`**

```jsonc
// request
{ "barcode": "8041520233" }

// 200 — the full updated cart, plus which line was touched so the UI can flash it
{
  "sale": { /* cart shape above */ },
  "scannedLineId": "l-1",
  "created": false          // false = qty was incremented on an existing line
}
```

`scannedLineId` drives `justScannedLineId` (the 1.5s highlight). `404 PRODUCT_NOT_FOUND` for an
unknown barcode. Server-side this is an upsert honoring the `uq_osl_sale_barcode` merge rule from §2.1 — Firebird 5
supports `UPDATE OR INSERT` and `MERGE`, either of which does it in one statement against the
`uq_osl_sale_barcode` key:

```sql
UPDATE OR INSERT INTO open_sale_lines (id, sale_id, product_id, barcode, name, price, qty, position)
VALUES (?, ?, ?, ?, ?, ?, 1, ?)
MATCHING (sale_id, barcode)
RETURNING id;
```

Note `UPDATE OR INSERT` overwrites `qty` with the supplied value rather than incrementing, so use
`MERGE ... WHEN MATCHED THEN UPDATE SET qty = qty + 1` for the increment semantics the frontend
expects.

**`PATCH /open-sales/{id}/lines/{lineId}`** — body `{ "qty": 3 }`. `qty <= 0` deletes the line,
matching `setLineQty`. Returns the updated cart.

**`DELETE /open-sales/{id}`** — `204`. If it was the register's last cart, the server creates a
fresh empty one; the response body may carry `{ "replacement": { /* cart */ } }` so the client
does not need a second round trip.

### 3.4 Transactions — `/api/transactions`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/transactions` | Commit an open sale as a cash payment |
| `GET` | `/transactions` | Paginated list for the Transaksi page |
| `GET` | `/transactions/summary` | The four stat-strip figures |
| `GET` | `/transactions/{id}` | One transaction + lines (receipt panel) |
| `POST` | `/transactions/{id}/void` | Soft-void |
| `POST` | `/transactions/{id}/reprint` | Log a receipt reprint |

**`POST /transactions`** — the critical path. In one database transaction: allocate `saleNumber`
from the register's generator (§2.3 — no row lock), recompute `total` from the cart's lines, copy
lines into `transaction_lines`, delete the open sale, commit. Wrap in the `with_retry` helper so a
Firebird `lock conflict` on the open-sale rows retries rather than surfacing as a 500.

```jsonc
// request — only the cart and the cash received; the server derives everything else
{ "openSaleId": "s-1", "tendered": 500000 }

// 201
{
  "id": "t-1042",
  "saleNumber": 1043,
  "lines": [ { "id": "tl-1", "productId": "...", "barcode": "...", "name": "...", "price": 95000, "qty": 1 } ],
  "total": 285000,
  "tendered": 500000,
  "change": 215000,
  "cashierName": "ShitaMira",
  "registerId": "01",
  "createdAt": "2026-09-26T07:15:00Z",
  "status": "completed"
}
```

Errors:
- `400 EMPTY_SALE` — cart has no lines (the UI disables pay, but enforce it).
- `400 INSUFFICIENT_TENDER` — `tendered < total`; include the server's `total` in the detail so a
  stale client can correct itself.
- `404 OPEN_SALE_NOT_FOUND` — already committed or discarded.

`total` is **recomputed server-side**, never taken from the request. A client-supplied total is an
opportunity to charge the wrong amount.

**`GET /transactions`** — params `page`, `pageSize` (default 25), `status`
(`completed` | `voided` | `all`, default `all` — the table shows both), `from` / `to` ISO dates
(default: today, matching the page's "today" framing). Newest first, matching the store's
`[transaction, ...state.transactions]` prepend. Response uses the same envelope as
`GET /products`. List items may omit `lines` for payload size; the receipt panel fetches detail by
id. Note this is a small change from today's behavior, where every transaction arrives with its
lines attached.

**`GET /transactions/summary`** — accepts the same `from` / `to`. A single aggregate query over
`ix_txn_reg_created`; `gross` needs a join to `transaction_lines` (or read it from
`SUM(transactions.total)` for completed rows, which is equal given no discounts exist yet).
Returns exactly what `TransactionsStatStrip` renders:

```jsonc
{
  "salesCount": 18,       // completed only
  "gross": 4820000,       // sum of completed line totals
  "cashInDrawer": 4820000,// sum of completed `total`
  "voidedCount": 2
}
```

**`POST /transactions/{id}/void}`** — sets `status = "voided"`, stamps `voided_at` / `voided_by`
from the session. `200` with the updated transaction. `409 ALREADY_VOIDED` on a repeat.

**`POST /transactions/{id}/reprint`** — records the reprint and returns `200`. The frontend
currently only fires a toast; this gives the action an audit trail. Optional for a first cut.

### 3.5 Registers — `/api/registers`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/registers` | Active registers, for a register picker at login |

Low priority — the app is single-register today.

---

## 4. Suggested project layout

```
backend/
  main.py                  # FastAPI app, CORS, router mounting
  app/
    config.py              # pydantic-settings: DATABASE_URL, SESSION_TTL, CORS origins
    database.py            # engine, sessionmaker, get_db dependency
    models.py              # §2.1
    types.py               # UUIDStr and other Firebird type helpers (§2.2)
    schemas/               # Pydantic v2, camelCase aliases
      product.py  sale.py  transaction.py  auth.py  common.py
    routers/
      auth.py  products.py  open_sales.py  transactions.py  registers.py
    services/
      sale_numbers.py      # generator allocation + retry helper (§2.3)
      checkout.py          # the commit transaction
    dependencies.py        # current_session / current_cashier
    seed.py                # ports frontend/lib/data/seed-*.ts for dev
  alembic/
  schema.sql               # generators + triggers Alembic will not autogenerate
```

Dependencies for the currently-empty `pyproject.toml`:

```toml
dependencies = [
    "fastapi",
    "uvicorn[standard]",
    "sqlalchemy>=2.0",
    "sqlalchemy-firebird>=2.2",   # external dialect; SQLAlchemy dropped Firebird in 1.4
    "firebird-driver>=2.0",       # DB-API layer, needs the Firebird client library
    "alembic",
    "pydantic-settings",
    "argon2-cffi",
    "python-multipart",
]
```

`requires-python = ">=3.12"` in the existing file is compatible — `sqlalchemy-firebird` requires
3.11+.

**Client library.** `firebird-driver` binds to the native Firebird client (`fbclient.so` /
`fbclient.dll`), which is **not** bundled with the wheel. On the dev Mac: `brew install firebird`,
or point `FIREBIRD_LIBRARY_PATH` at an existing install. On a Linux server, install
`libfbclient2` (or the Firebird 5 server package) before the app will import. This is the most
common first-run failure and worth putting in the README.

## 5. Suggested build order

0. **Stand up Firebird 5 first.** Create the database with `DEFAULT CHARACTER SET UTF8` and page
   size 8192+, install the client library, and confirm `create_engine(...).connect()` succeeds
   before writing any models. The dialect/driver/client-library chain is the riskiest setup step
   in this project and it is much easier to debug in isolation.
1. Config, database, `Base`, `types.py`, Alembic baseline (plus `schema.sql` for generators and
   the `products_bi_bu` trigger).
2. `Register` + `Cashier` + `Session`; `/api/auth/*`; point the existing server action at it.
3. `Product` + all of `/api/products`; swap `products-store.ts` to fetch. Lowest-risk slice —
   the catalog has no cross-entity invariants.
4. `OpenSale` / `OpenSaleLine` + `/api/open-sales`; move `sales-store.ts` to server-backed carts.
5. `Transaction` / `TransactionLine`, the generator-based sale-number allocator (§2.3), and the
   checkout service. This closes the `saleNumber: null` gap from §1.4.
6. Void, summary, reprint.
7. Port the seed fixtures so dev data matches what the frontend ships with today.
