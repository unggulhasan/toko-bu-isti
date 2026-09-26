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
| `/login` | Login | 4-digit PIN entry; the PIN identifies which cashier is signing in |
| `/` | Kasir (checkout) | Scan items into a cart, park multiple carts, take cash payment |
| `/products` | Produk | CRUD product catalog, search by name/barcode, paginated 8/page |
| `/transactions` | Transaksi | Day's transaction list, receipt detail, void, reprint, stat strip |

### 1.2 Core domain concepts

Four entities, mapping directly to `frontend/lib/types.ts`:

- **Product** — catalog item keyed by `barcode`. Fields: `barcode`, `name`, `price`, plus audit
  `updatedAt` / `updatedBy`.
- **OpenSale** — a parked, unpaid cart. The till holds *several simultaneously*; the cashier
  cycles between them with `,` / `.` / `F3`. Currently persisted client-side under
  `pos:open-sales`. This is the concept most in need of server ownership, since a parked cart
  must survive a browser refresh or a move to another terminal.
- **SaleLine** — a line inside a cart or a committed transaction: `productId`, `barcode`, `name`,
  `price`, `qty`. Note that `barcode`, `name` and `price` are **denormalized snapshots** — a
  receipt must show the price charged at the time, not today's catalog price. The backend must
  preserve this.
- **Transaction** — a committed sale: the lines, `total`, `tendered`, `change`, `cashierName`,
  `createdAt`, and `status` of `completed` | `voided`. Voiding is a soft state change, never a
  delete. (`registerId` is in the current TS type but is being dropped — §1.6.)

### 1.3 Behaviors the backend must support

**Scanning.** `scanBarcode` looks up a product by exact barcode. Found → increment the existing
line's qty if that barcode is already in the cart, else append a new line with qty 1. Not found →
the UI shows `Barkode "<code>" tidak ditemukan`. The backend needs a fast exact-match barcode
lookup and should return a clear 404 for misses so the frontend can render that message.

**Sale numbering.** `Transaction.saleNumber` is `number | null` and the frontend currently commits
with `saleNumber: null` — it has no way to allocate one. Seeded transactions show `1042`, `1041`,
etc. **This is a gap the backend must close**: the server assigns a monotonically increasing sale
number on commit. The receipt panel and transaction table both render `#{saleNumber}` and fall
back to `—`, so this is visibly broken until the backend owns it.

**Payment.** Cash only. `change = tendered - total`; confirm is blocked while `tendered < total`.
Server must recompute `total` from the lines rather than trusting the client, and reject
`tendered < total`.

**Void.** Flips `status` to `voided`. Voided transactions are excluded from the stat strip's
`salesCount`, `gross` and `cashInDrawer`, and counted separately as `voidedCount`. Already-voided
transactions cannot be voided again (the button is disabled client-side; enforce server-side too).

**Stats.** The transactions page computes four figures over the day's transactions. With
server-side pagination these can no longer be derived from the loaded page, so they need a
dedicated summary endpoint.

**Session.** As of commit `8f02c7d` the frontend does its own auth, entirely client-side. A
4-digit PIN entered through an `InputOTP` is looked up in a hardcoded map in
`session-store.ts`:

```ts
const CASHIERS: Record<string, { cashierName: string; registerId: string }> = {
  "1234": { cashierName: "Kasir 1", registerId: "01" },
  "7890": { cashierName: "Kasir 2", registerId: "02" },
}
```

The PIN is a **cashier identifier, not just a gate** — it selects who is signed in.
`useSessionStore` persists `{ isLoggedIn, cashierName, registerId }` to `localStorage` under
`pos:session`; `app/(pos)/layout.tsx` redirects to `/login` when `isLoggedIn` is false, and
logout clears the store and pushes to `/login`.

**The backend owns PIN → cashier resolution.** `POST /auth/login` takes the PIN and returns the
cashier it maps to; the hardcoded `CASHIERS` map becomes rows in the `cashiers` table.

**The register concept is removed entirely** (decision 2026-09-26 — see §1.6). The store's
`registerId` and the `"02"` on PIN `7890` come out of the frontend too; the cashier is the only
actor identified.

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
7. **Auth is client-side and the server layer was removed.** Commit `8f02c7d` deleted
   `proxy.ts` (the route-guarding middleware) and `app/(auth)/login/actions.ts` (the server
   action that set the `httpOnly` cookie). Route protection is now a `useEffect` redirect in
   `app/(pos)/layout.tsx`, and the PIN map ships in the client bundle. Anyone can reach the API
   directly. **This is a deliberate choice for a small local grocery POS on a private LAN and
   the spec does not try to undo it** — see §3.0 for how the backend accommodates it.
8. **`registerId` is being removed from the frontend.** The PIN map, `Transaction` type, three
   display sites and the seed fixtures all carry a register that the backend does not model —
   see §1.6 for the exact edits.

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
- **Auth**: no cookie and no middleware — both were removed in `8f02c7d`. The frontend holds the
  session in `localStorage` and sends the cashier as explicit request context. See §3.0.
- **No register/terminal concept** anywhere in the schema or API. See §1.6.
- **Errors**: `{ "detail": { "code": "PRODUCT_NOT_FOUND", "message": "..." } }`.

### 1.6 The register concept is removed entirely

**There is no register anywhere in this design** (decision 2026-09-26): no table, no FK, no
column, no config value, no header, no API field. The cashier is the only actor the system
identifies.

Why: the shop runs up to two laptops (one acting as server + client, one client-only), but both
talk to the same database and sell from the same catalog, drawer and receipt sequence. **Which
physical laptop rang a sale is not information the business acts on** — nobody reconciles a
drawer per laptop or reports per terminal. Cashier identification already answers "who sold
this", which is the question that gets asked.

Recording a terminal identifier "just in case" would be speculative denormalization: a column on
every transaction, forever, carrying data no feature reads. If per-terminal reporting is ever
genuinely needed, adding it then is a small migration — and it can be done properly, with a real
`registers` table rather than the bare string a placeholder would have left behind.

**This supersedes what the frontend currently does**, and the frontend should be updated to
match:

| Location | Today | Change to |
| --- | --- | --- |
| [session-store.ts:5](frontend/lib/store/session-store.ts#L5) | `CASHIERS` map with `registerId` | drop `registerId` from the map and from `SessionState` |
| [types.ts:33](frontend/lib/types.ts#L33) | `Transaction.registerId: string` | delete the field |
| [app-shell.tsx:52](frontend/components/pos/app-shell.tsx#L52) | `Register {registerId}` | drop it; the header already shows `cashierName` |
| [receipt-panel.tsx:47](frontend/components/pos/receipt-panel.tsx#L47) | `REG {registerId} · {cashierName}` | `{cashierName}` alone |
| [transactions/page.tsx:41](frontend/app/(pos)/transactions/page.tsx#L41) | `· register {registerId}` | drop the clause |
| [seed-transactions.ts](frontend/lib/data/seed-transactions.ts) | `registerId: "01"` ×7 | remove |

Both PINs then resolve to a cashier and nothing else. The `"02"` on PIN `7890` — which was
always placeholder data, never a second physical till — disappears with the field.

Consequences for the backend, so nobody reintroduces this by reflex:

- **One generator**, `gen_sale_number`. Receipts are one continuous sequence for the shop.
- **`transactions.sale_number` is plainly `unique`**, not composite with anything.
- **Open sales belong to the shop.** A cart parked on one laptop is resumable on the other —
  which is a genuine *benefit* of not scoping by terminal, not merely an absence of one.
- **`X-Cashier-Id` is the only request context header.**

---

## 2. Database layer (Firebird 5)

### 2.0 Dialect, driver and connection

SQLAlchemy **dropped its built-in Firebird dialect in 1.4**. Firebird support now comes from the
externally maintained `sqlalchemy-firebird` package (2.2.0 at time of writing), which targets
SQLAlchemy 2.0+ and Firebird 3.0+ and sits on the modern `firebird-driver` DB-API module.

```
# Windows (production) — drive-letter path
firebird+firebird://SYSDBA:masterkey@localhost:3050/C:/TokoBuIsti/data/tokobuisti.fdb

# macOS (dev) — note the doubled slash: the path after the host is absolute,
# so the URL needs // to express a leading /
firebird+firebird://SYSDBA:masterkey@localhost:3050//Users/unggulhasan/fb/tokobuisti.fdb
```

Windows paths use forward slashes in the URL even though the filesystem uses backslashes; a
literal `\` would need escaping and is a common source of confusion. **Prefer a database alias**
declared in `databases.conf` — it keeps the URL identical on both platforms, which means one
connection string in code and the path difference isolated to a config file the deployment
owns:

```
# databases.conf, on each machine
tokobuisti = C:\TokoBuIsti\data\tokobuisti.fdb      # Windows
tokobuisti = /Users/unggulhasan/fb/tokobuisti.fdb    # macOS
```

```
firebird+firebird://SYSDBA:masterkey@localhost:3050/tokobuisti
```

On Windows, `databases.conf` lives in the Firebird install directory (typically
`C:\Program Files\Firebird\Firebird_5_0\`); on macOS it is at
`/Library/Frameworks/Firebird.framework/Resources/databases.conf`.

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


# NOTE: there is no register/terminal entity anywhere in this schema. The cashier
# is the only actor identified. See §1.6.


class Cashier(Base, TimestampMixin):
    """Replaces the hardcoded CASHIERS map in session-store.ts.

    The 4-digit PIN both authenticates and *identifies* — it selects which
    cashier is signed in. See §1.3.
    """

    __tablename__ = "cashiers"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(80), nullable=False)

    # The PIN is a lookup key, so it must be unique across active cashiers and
    # queryable — which rules out a per-row salted hash (you cannot look one up
    # without scanning every cashier and verifying each). Stored as-is; §3.0
    # explains why that is acceptable here and what to change if it stops being.
    pin: Mapped[str] = mapped_column(String(8), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Same nullable-column trick as products: PIN unique among active cashiers
    # only, so a retired cashier's PIN can be reissued. See §2.2.
    pin_active: Mapped[str | None] = mapped_column(String(8))

    __table_args__ = (
        UniqueConstraint("pin_active", name="uq_cashiers_pin_live"),
    )


# NOTE: there is no `Session` / `pos_sessions` table. The earlier draft of this
# spec had one to back an httpOnly `pos_session` cookie, but commit 8f02c7d
# removed the cookie and the middleware from the frontend — the session now
# lives in localStorage and the server is stateless with respect to login.
# See §3.0.


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
    """A parked, unpaid cart. Several are open at once, shop-wide — so a cart parked
    on one laptop is resumable on the other (§1.6)."""

    __tablename__ = "open_sales"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)
    # Stable ordering for the OpenSalesStrip tabs and for `,` / `.` cycling.
    # The strip labels tabs by 1-based position, so order must be deterministic.
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
        CheckConstraint("qty > 0", name="ck_osl_qty_positive"),
    )


# One shop-wide receipt counter (§1.6). Firebird generators are lock-free, which is
# why the counter is a sequence and not a locked row (§2.3).
sale_number_seq = Sequence("gen_sale_number", metadata=Base.metadata)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=_uuid)

    # Allocated from gen_sale_number inside the checkout transaction. Non-null for
    # every committed transaction — the frontend's `number | null` reflects only
    # its inability to allocate one locally.
    sale_number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)

    cashier_id: Mapped[str | None] = mapped_column(
        ForeignKey("cashiers.id", ondelete="SET NULL")
    )
    # Denormalized for the receipt — must not change if the cashier is later
    # renamed or deactivated. There is no terminal/register column (§1.6).
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

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False, index=True
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime)
    voided_by: Mapped[str | None] = mapped_column(String(80))

    lines: Mapped[list["TransactionLine"]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan",
        order_by="TransactionLine.position",
    )

    __table_args__ = (
        # `sale_number` is unique outright now that there is one counter, declared
        # inline on the column above. Serves the transactions list and the daily
        # stat strip; every query on it is newest-first.
        Index("ix_txn_created", "created_at"),
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

The same pattern applies to `cashiers.pin_active`, so a retired cashier's PIN can be handed to
someone new without colliding with the old row:

```sql
CREATE TRIGGER cashiers_bi_bu FOR cashiers
ACTIVE BEFORE INSERT OR UPDATE POSITION 0
AS BEGIN
  NEW.pin_active = IIF(NEW.is_active, NEW.pin, NULL);
END
```

**Identifier length is 63 characters** on Firebird 4.0+ (it was 31 on 3.0). Every constraint and
index name above is well inside that, but the names were shortened from the Postgres draft —
`ck_products_price_positive` is 26 characters and `uq_open_sale_line_barcode` was shortened to
`uq_osl_sale_barcode` — comfortably inside the limit, with headroom for prefixes Alembic may
add. Do not let Alembic autogenerate long implicit names.

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

The Postgres-shaped design used `SELECT ... FOR UPDATE` on a counter column. **Do not do this on
Firebird.** Firebird's MVCC raises a `lock conflict` / `deadlock` error on write-write contention
rather than queueing, so a locked counter row turns every concurrent checkout into an
application-level retry. Firebird's native answer is a **generator** (sequence), which is
*outside* transaction control and never blocks:

```sql
CREATE SEQUENCE gen_sale_number START WITH 1043 INCREMENT BY 1;
```

**One generator, shop-wide** (§1.6). It starts at 1043 to continue the seeded fixtures, whose
highest `saleNumber` is 1042.

```python
# backend/app/services/sale_numbers.py
from sqlalchemy import text

_NEXT_SALE_NUMBER = text("SELECT NEXT VALUE FOR gen_sale_number FROM rdb$database")

def allocate_sale_number(db) -> int:
    """Atomic, lock-free, and safe under any isolation level."""
    return db.execute(_NEXT_SALE_NUMBER).scalar_one()
```

A fixed generator name means the statement is a constant — no name is formatted into SQL, so the
input-validation caveat a dynamically-named generator would need is gone.

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

Base path `/api`.

### 3.0 The auth model, and what the backend does about it

Commit `8f02c7d` moved authentication entirely into the client. There is no cookie, no
middleware, and no server-issued token: `useSessionStore` persists
`{ isLoggedIn, cashierName, registerId }` to `localStorage`, and `app/(pos)/layout.tsx` guards
routes with a `useEffect` redirect.

**The backend is therefore stateless with respect to login.** It does not issue or validate
session tokens, and it does not reject unauthenticated requests. `POST /auth/login` is a
*lookup* — PIN in, cashier out — not a credential exchange. This keeps the API
aligned with how the frontend now works rather than reintroducing a layer the frontend deleted.

This is a deliberate fit for a two-laptop POS on a private shop LAN, and the spec builds to it.
Two practical guardrails that cost nothing and are worth having anyway:

- **Bind the API to the LAN interface, not `0.0.0.0`.** The client laptop must reach the server
  laptop, so `127.0.0.1` is too narrow — bind to the server's static LAN IP
  (`--host 192.168.1.10`). That keeps the API off any other interface the laptop may acquire,
  such as a public Wi-Fi network or a tethered connection, where an unauthenticated API would be
  genuinely exposed. A host-firewall rule limiting port 8000 to the local subnet is the belt to
  this braces.
- **Keep the PIN out of URLs.** `POST` with a JSON body, so PINs do not land in access logs or
  browser history. The spec below does this.

If the shop ever adds a second terminal, remote access, or staff whose actions need to be
non-repudiable, revisit this: reinstate a server-issued session token, hash the PIN with argon2,
and validate on every route. The `Cashier` model is shaped so that change is additive — swap
`pin` for `pin_hash` and add back a sessions table. Nothing else in the schema moves.

**Request context.** Because there is no session on the server, routes that record *who* did
something take the cashier explicitly, via an `X-Cashier-Id` header resolved by a dependency:

```python
# backend/app/dependencies.py
def current_cashier(
    x_cashier_id: Annotated[str, Header()],
    db: Annotated[Session, Depends(get_db)],
) -> Cashier:
    cashier = db.scalar(
        select(Cashier).where(Cashier.id == x_cashier_id, Cashier.is_active)
    )
    if cashier is None:
        raise HTTPException(400, {"code": "UNKNOWN_CASHIER",
                                  "message": "Kasir tidak dikenal"})
    return cashier
```

A header rather than a query param keeps it out of logs and off every route signature. The
frontend sets it in a shared fetch wrapper; `POST /auth/login` returns `cashier.id` for it to
store alongside the name.

It is the **only** context header. Four routes need it: `POST /products` and
`PATCH /products/{id}` (for `updated_by`), `POST /transactions` (for `cashier_name`), and
`POST /transactions/{id}/void` (for `voided_by`). Everything else needs no actor at all.

There is no terminal or register header, because nothing is scoped that way (§1.6).

### 3.1 Auth — `/api/auth`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/login` | Resolve a PIN to its cashier |
| `GET` | `/auth/cashiers` | Active cashiers, for seeding/admin — not used by login |

There is no `/auth/logout` and no `/auth/session`. Logout is `useSessionStore.logout()` clearing
`localStorage`; the server holds nothing to revoke. Session state is read from the Zustand store,
not fetched.

**`POST /auth/login`** — replaces the hardcoded `CASHIERS` map.

```jsonc
// request
{ "pin": "1234" }

// 200
{
  "cashier": { "id": "c-...", "name": "Kasir 1" }
}
```

`401 INVALID_PIN` on an unknown or inactive PIN. The frontend's `login(password)` action keeps
its `boolean` return shape — it calls this endpoint, and on `200` sets
`{ isLoggedIn: true, cashierId, cashierName }` from the response instead of from the local map —
note `registerId` is gone and `cashierId` replaces it, since `X-Cashier-Id` needs it. Since
`login` becomes async, [login/page.tsx:38](frontend/app/(auth)/login/page.tsx#L38)'s
`handleSubmit` needs to `await` it.

Seeding the two existing PINs:

| PIN | Cashier |
| --- | --- |
| `1234` | Kasir 1 |
| `7890` | Kasir 2 |

Per §1.6 the register column is gone from both PINs; each resolves to a cashier and nothing
else.

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
// request — updatedBy is resolved from X-Cashier-Id, not sent in the body
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

These replace the `pos:open-sales` localStorage slice. There is one set of carts for the shop,
not per terminal (§1.6) — so a cart parked on the server laptop can be resumed on the client
laptop, which the localStorage version could not do.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/open-sales` | All parked carts |
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

**`GET /open-sales`** returns `{ "items": [...] }` ordered by `position`. If there are no carts,
the server creates and returns one empty cart — the frontend always assumes at least one
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

**`DELETE /open-sales/{id}`** — `204`. If it was the last cart, the server creates a
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
from `gen_sale_number` (§2.3 — no row lock), recompute `total` from the cart's lines, copy
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
  "cashierName": "Kasir 1",
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
`ix_txn_created`; `gross` needs a join to `transaction_lines` (or read it from
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

**`POST /transactions/{id}/void`** — sets `status = "voided"`, stamps `voided_at` and
`voided_by` (from `X-Cashier-Id`). `200` with the updated transaction. `409 ALREADY_VOIDED` on a
repeat.

**`POST /transactions/{id}/reprint`** — records the reprint and returns `200`. The frontend
currently only fires a toast; this gives the action an audit trail. Optional for a first cut.

---

## 4. Suggested project layout

```
backend/
  main.py                  # FastAPI app, CORS, router mounting
  app/
    config.py              # pydantic-settings: DATABASE_URL, CORS origins, bind host,
                           #   fb_client_library (Windows override, §4)
    database.py            # engine, sessionmaker, get_db dependency
    models.py              # §2.1
    types.py               # UUIDStr and other Firebird type helpers (§2.2)
    schemas/               # Pydantic v2, camelCase aliases
      product.py  sale.py  transaction.py  auth.py  common.py
    routers/
      auth.py  products.py  open_sales.py  transactions.py
    services/
      sale_numbers.py      # generator allocation + retry helper (§2.3)
      checkout.py          # the commit transaction
    dependencies.py        # current_cashier (§3.0 — X-Cashier-Id header)
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
    "python-multipart",
]
```

`requires-python = ">=3.12"` in the existing file is compatible — `sqlalchemy-firebird` requires
3.11+. No password-hashing library is listed: PINs are looked up directly (§3.0). Add
`argon2-cffi` if the auth model is ever tightened.

**CORS.** The frontend calls the API from the browser now that there is no server action
proxying requests, so `CORSMiddleware` must allow the Next.js origin. In dev that is
`http://localhost:3000`. In production there are **two laptops** — one running server + client,
one client-only — so the client laptop's browser calls the server laptop over the LAN, and its
origin must be allowed too:

```python
allow_origins = ["http://localhost:3000", "http://192.168.1.10:3000"]  # server laptop's LAN IP
```

Give the server laptop a static LAN IP (or a hostname reservation), otherwise DHCP will
eventually move it and both the CORS list and the client's API base URL will break.
`allow_credentials` is not needed — there are no cookies.

**Client library.** `firebird-driver` binds to the native Firebird client library, which is
**not** bundled with the wheel. It resolves that library differently per platform, so the two
environments in play here fail in different ways:

| Platform | Role | Resolution | Works out of the box? |
| --- | --- | --- | --- |
| Windows | **production** | `find_library("fbclient.dll")` → `ctypes.WinDLL` | Yes, if `fbclient.dll` is on `PATH` |
| macOS | dev only | `find_library("Firebird")` → `ctypes.CDLL` | **No** — needs the shim below |

Because the two paths are independent, the macOS workaround must never run on Windows. Guard it
on `sys.platform` exactly as shown.

#### Windows (production)

Install the Firebird 5 **server** (or at minimum the client package) from firebirdsql.org. The
installer's "Copy client library to `<system>` directory" option puts `fbclient.dll` where
`find_library` will see it; if you decline that, add the Firebird `bin\` directory to the
system `PATH` instead.

The one thing to get right: **architecture must match**. A 64-bit Python cannot load a 32-bit
`fbclient.dll`, and the error (`OSError: [WinError 193] %1 is not a valid Win32 application`)
does not say so. Install 64-bit Firebird alongside 64-bit Python.

If the DLL is deliberately kept outside `PATH` — a reasonable choice when pinning an exact
client version next to the app — point the driver at it explicitly rather than mutating `PATH`:

```python
from firebird.driver import driver_config
driver_config.fb_client_library.value = r"C:\Program Files\Firebird\Firebird_5_0\fbclient.dll"
```

That is this driver's supported override (note: it is *not* `FIREBIRD_LIBRARY_PATH`, which the
driver does not read). Drive it from a setting so dev and production differ only in config:

```python
# backend/app/config.py
fb_client_library: str | None = None   # set in the Windows .env; leave unset on macOS
```

Since production is a single Windows machine, also decide where the `.fdb` file lives and keep
it off any synced folder (OneDrive, Dropbox). Firebird holds the file open with its own locking;
a sync client rewriting it underneath is a known way to corrupt a database.

#### macOS (development only)

There is no Homebrew formula — `brew install firebird` fails with "No available formula". Use
the official `.pkg` from firebirdsql.org, which installs a framework at
`/Library/Frameworks/Firebird.framework/` (verified against **Firebird 5.0.4** installed this
way). The driver finds that framework on its own, but **loading it fails out of the box**:

```
OSError: dlopen(/Library/Frameworks/Firebird.framework/Firebird):
  Library not loaded: @rpath/lib/libtommath.dylib
  Reason: no LC_RPATH's found
```

`libfbclient.dylib` references its sibling libraries through `@rpath` but ships with no
`LC_RPATH` load command, so the loader cannot resolve them. `libtommath.dylib` is present, in
the same directory as `libfbclient.dylib` — only the lookup is broken. This is a defect in the
macOS framework packaging specifically; **Windows is unaffected.**

**The fix**: preload the missing library with `ctypes` before anything imports the driver. Put
this at the top of `app/database.py`, above the `sqlalchemy` imports:

```python
# backend/app/database.py
import ctypes
import sys

# macOS dev only. The official Firebird.framework ships libfbclient.dylib with no
# LC_RPATH, so its @rpath/lib/libtommath.dylib reference cannot be resolved.
# Preloading it into the global namespace satisfies the reference. Must run
# before the driver is imported. Windows resolves fbclient.dll via PATH and needs
# none of this — hence the platform guard.
if sys.platform == "darwin":
    _FB_LIB = "/Library/Frameworks/Firebird.framework/Versions/A/Resources/lib"
    ctypes.CDLL(f"{_FB_LIB}/libtommath.dylib", mode=ctypes.RTLD_GLOBAL)

from sqlalchemy import create_engine   # noqa: E402
```

Verified working: with the preload, `import sqlalchemy_firebird` and
`create_engine("firebird+firebird://...")` both succeed against SQLAlchemy 2.1.1.

Two alternatives, both rejected after testing:

- `DYLD_LIBRARY_PATH=/Library/Frameworks/Firebird.framework/Versions/A/Resources/lib` also
  works, but **only when set before the process starts** — assigning it to `os.environ` inside
  Python is too late, because the dynamic loader reads it at launch. It is also stripped by
  macOS SIP when passed through some launchers.
- Patching an `LC_RPATH` into the dylib with `install_name_tool` **does not work**: the binary
  has no header padding, so the tool refuses with "larger updated load commands do not fit".

#### Keeping the two honest

The failure modes are platform-specific and neither reproduces on the other OS, so the
Windows path cannot be validated from the dev Mac. Two cheap safeguards:

- Make the connection check a runnable script (`python -m app.healthcheck`) rather than a
  manual step, so it can be run on the Windows box as the first deployment action.
- Pin `firebird-driver` and `sqlalchemy-firebird` to exact versions in `pyproject.toml`. A
  driver upgrade that changes library resolution would surface on the production machine first,
  which is the worst place to find it.

This is the most common first-run failure on both platforms and belongs in the README.

## 5. Suggested build order

0. **Stand up Firebird 5 first.** Already done on the dev Mac: Firebird 5.0.4 via the official
   `.pkg`, at `/Library/Frameworks/Firebird.framework/`. What remains is to add the `libtommath`
   preload shim from §4 (without it the driver will not even import on macOS), create the
   database with `DEFAULT CHARACTER SET UTF8` and page size 8192+, and confirm
   `create_engine(...).connect()` succeeds before writing any models. The
   dialect/driver/client-library chain is the riskiest setup step here and is much easier to
   debug in isolation.

   `isql` lives at `/Library/Frameworks/Firebird.framework/Resources/bin/isql` on macOS and in
   the install directory's `bin\` on Windows — not on `PATH` by default on either. Creating the
   database:

   ```sql
   CREATE DATABASE 'tokobuisti'
     USER 'SYSDBA' PASSWORD 'masterkey'
     PAGE_SIZE 8192
     DEFAULT CHARACTER SET UTF8;
   ```

   (Using the `databases.conf` alias from §2.0; substitute a full path if you skip the alias.)
   `.gitignore` already covers `*.fdb` (commit `079078a`), so the database file will not be
   committed.

   **Repeat this step on the Windows box before anything else ships there.** Per §4, the
   Windows client-library path is entirely separate from the macOS one and cannot be validated
   from the Mac — an architecture mismatch or a missing `fbclient.dll` will not surface until
   the code runs on that machine.
1. Config, database, `Base`, `types.py`, Alembic baseline (plus `schema.sql` for generators and
   the `products_bi_bu` trigger).
2. `Cashier` + `POST /api/auth/login`; swap the `CASHIERS` map in `session-store.ts` for a
   fetch, keeping `login()`'s boolean contract (it becomes async, so the login page must await
   it). Store `cashierId` alongside `cashierName` and drop `registerId` (§1.6). Seed both
   cashiers and the `gen_sale_number` generator. Add the shared fetch wrapper that attaches
   `X-Cashier-Id` here — later steps depend on it.

   Give that wrapper a single place to turn a network failure into a visible error, since every
   later step routes through it. With no offline mode (§6), "server unreachable" is a normal
   operating state for the client laptop and the UI must say so rather than rendering an empty
   catalog. Building it here costs one `catch` and a toast; retrofitting it across four stores
   later costs considerably more.
3. `Product` + all of `/api/products`; swap `products-store.ts` to fetch. Lowest-risk slice —
   the catalog has no cross-entity invariants.
4. `OpenSale` / `OpenSaleLine` + `/api/open-sales`; move `sales-store.ts` to server-backed
   carts.
5. `Transaction` / `TransactionLine`, the generator-based sale-number allocator (§2.3), and the
   checkout service. This closes the `saleNumber: null` gap from §1.4.
6. Void, summary, reprint.
7. Port the seed fixtures so dev data matches what the frontend ships with today, minus
   `registerId` (§1.6).
8. **Windows deployment dry-run.** Install Firebird 5 (64-bit, matching Python), create the
   database and the `gen_sale_number` generator, run the healthcheck script from §4, then
   exercise one full checkout end to end. Do this well before the shop needs it — the failure
   modes here are environmental, not logical, so they do not appear in any test that passes on
   the Mac. Include the **second laptop** in this run: point its browser at the server's LAN IP,
   confirm CORS allows it, park a cart on one machine and resume it on the other, then pull the
   network cable and confirm the client fails with a legible message (§6) rather than an empty
   screen.

## 6. Production notes (Windows)

The shop runs up to two Windows laptops: one hosting Firebird + the API + a browser, one
browser-only. Only the first holds any state.

- **The server laptop needs a static LAN IP** (or a DHCP reservation). The client laptop's API
  base URL and the CORS allow-list both hard-code it (§4), so an address change breaks the
  client with a confusing CORS error rather than an obvious one.
- **The client laptop is disposable; the server laptop is not.** All data lives in one `.fdb` on
  the server. If that laptop is the one that gets dropped or stolen, the shop's entire sales
  history goes with it — which makes the `gbak` schedule below the single most important item in
  this list, and it should write to somewhere physically separate.
- **No offline mode — accepted** (decision 2026-09-26). When the server laptop is off or off the
  network, the client laptop is unusable: no catalog, no carts, no checkout. This is a deliberate
  simplification, not an oversight, and the whole design leans on it — the server is the single
  source of truth for the catalog, the open carts and the receipt sequence, with no local queue,
  no conflict resolution and no sale-number reconciliation to build or reason about.

  Two things follow, and they are cheap:

  - **The client laptop should fail legibly, not silently.** A failed fetch must surface as
    something like "Tidak dapat menghubungi server kasir" rather than an empty product list or a
    cart that appears to accept scans and then loses them. An empty catalog looks like a data
    problem; a connection error tells the cashier to go check the other laptop.
  - **The server laptop is the one that must stay up.** It should be the primary till — the one
    normally staffed — so that if either machine is switched off or carried away, it is the
    client. Pair that with the Windows-service setup below so the API is not tied to someone
    staying logged in.

  Revisit only if the shop starts wanting to trade while the server laptop is down; that would
  be a rewrite of the state model, not an added feature.
- **Run the API as a Windows service** (via NSSM or `sc.exe`) rather than a console window, so
  it survives logout and restarts with the machine. A closed terminal window should not be able
  to take the till down mid-trade.
- **Firebird's own service** must start before the API. If the API starts first it will fail its
  first connection; `pool_pre_ping` (§2.0) recovers once Firebird is up, but set the service
  dependency so the ordering is not left to chance.
- **Keep the `.fdb` off OneDrive/Dropbox and off a network share.** Firebird manages its own
  file locking; a sync client or SMB layer writing underneath it is a documented corruption
  path.
- **Back up with `gbak`, not by copying the file.** A file copy of a live database is not
  consistent. `gbak -b` produces a restorable backup while the database is in use; schedule it
  nightly to a separate drive.
- **Sweep interval.** Firebird's MVCC accumulates record versions; the default automatic sweep
  is usually fine at this transaction volume, but if the database grows oddly, check
  `gstat -h` for a widening OIT/OAT gap.
