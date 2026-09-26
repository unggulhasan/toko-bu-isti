# Backend Specification — Toko Bu Isti POS

Derived from the Next.js frontend in `frontend/`. The frontend currently runs entirely on
Zustand stores persisted to `localStorage` with seeded fixtures. This document specifies the
FastAPI + SQLAlchemy backend needed to replace those fixtures with real persistence.

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
   soft-delete `is_active` flag, so historical receipts survive a catalog deletion.
4. **Price is `number`** — JS floats for currency. Rupiah is integral and `formatRupiah` already
   rounds, so the backend stores `BigInteger` minor-unit-free rupiah. Never `Float`.
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
- **IDs**: server-generated UUID strings. The frontend types already declare `id: string`, so
  existing code needs no type change.
- **Timestamps**: ISO-8601 UTC strings, matching `new Date().toISOString()`.
- **Money**: integer rupiah.
- **Auth**: the existing `pos_session` cookie. The backend issues it on login and validates it on
  every other route.
- **Errors**: `{ "detail": { "code": "PRODUCT_NOT_FOUND", "message": "..." } }`.

---

## 2. SQLAlchemy Models

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
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class TransactionStatus(str, enum.Enum):
    completed = "completed"
    voided = "voided"


class Register(Base, TimestampMixin):
    """A physical till. `code` is the "01" shown in the header and on receipts."""

    __tablename__ = "registers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Monotonic per-register receipt counter. Allocated under a row lock on commit
    # so two concurrent payments can never share a saleNumber.
    next_sale_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    open_sales: Mapped[list["OpenSale"]] = relationship(back_populates="register")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="register")


class Cashier(Base, TimestampMixin):
    """Replaces the hardcoded `cashierName` in session-store.ts."""

    __tablename__ = "cashiers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # Shared-password model today; per-cashier PIN is the natural upgrade path.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    sessions: Mapped[list["Session"]] = relationship(back_populates="cashier")


class Session(Base):
    """Backs the existing httpOnly `pos_session` cookie."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    cashier_id: Mapped[str] = mapped_column(
        ForeignKey("cashiers.id", ondelete="CASCADE"), nullable=False
    )
    register_id: Mapped[str] = mapped_column(
        ForeignKey("registers.id", ondelete="CASCADE"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    cashier: Mapped[Cashier] = relationship(back_populates="sessions")
    register: Mapped[Register] = relationship()


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    barcode: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    # Integer rupiah. Never Float — see §1.4.
    price: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # Soft delete: the frontend's "Hapus produk" sets this instead of removing the
    # row, so historical transaction lines keep resolving.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Maps to Product.updatedBy — denormalized so a receipt/audit view does not
    # need a join, and survives the cashier being deactivated.
    updated_by: Mapped[str] = mapped_column(String(80), nullable=False)

    __table_args__ = (
        # Barcode is unique among *live* products only, so a deleted barcode can be
        # reissued. On Postgres prefer a partial index:
        #   Index("uq_products_barcode_active", "barcode", unique=True,
        #         postgresql_where=text("is_active"))
        UniqueConstraint("barcode", name="uq_products_barcode"),
        Index("ix_products_name", "name"),
    )


class OpenSale(Base, TimestampMixin):
    """A parked, unpaid cart. Several are open per register at once."""

    __tablename__ = "open_sales"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
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

    __table_args__ = (Index("ix_open_sales_register_position", "register_id", "position"),)


class OpenSaleLine(Base):
    __tablename__ = "open_sale_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
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
        UniqueConstraint("sale_id", "barcode", name="uq_open_sale_line_barcode"),
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)

    # Allocated server-side from Register.next_sale_number. Non-null for every
    # committed transaction — the frontend's `number | null` reflects only its
    # inability to allocate one locally.
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

    status: Mapped[TransactionStatus] = mapped_column(
        Enum(TransactionStatus, native_enum=False, length=16),
        default=TransactionStatus.completed,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by: Mapped[str | None] = mapped_column(String(80))

    register: Mapped[Register] = relationship(back_populates="transactions")
    lines: Mapped[list["TransactionLine"]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan",
        order_by="TransactionLine.position",
    )

    __table_args__ = (
        UniqueConstraint("register_id", "sale_number", name="uq_txn_register_sale_number"),
        # Serves the transactions list and the daily stat strip.
        Index("ix_txn_register_created", "register_id", "created_at"),
    )


class TransactionLine(Base):
    """Immutable once written — a receipt must never change retroactively."""

    __tablename__ = "transaction_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
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

### 2.1 Schema notes

- **Snapshot columns are deliberate.** `barcode` / `name` / `price` are duplicated onto every line
  because the frontend renders receipts straight from `transaction.lines`. Joining to `products`
  at read time would rewrite history the moment a price changes.
- **`line_total` is stored, not computed.** `lineAmount()` exists client-side, but persisting the
  product means a reprint in six months matches the paper original even if rounding rules change.
- **Sale number allocation** must happen inside the commit transaction with
  `SELECT ... FOR UPDATE` on the `registers` row (or a Postgres sequence per register). The
  `uq_txn_register_sale_number` constraint is the backstop.
- **`UniqueConstraint("sale_id", "barcode")`** on open-sale lines encodes the scan-merge rule in
  the schema rather than relying on application code to get it right every time.
- **Deleting products** flips `is_active`; `ON DELETE SET NULL` on line FKs covers the case where a
  row is genuinely purged later.

---

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
search barcodes), `limit` default 10 to match `MAX_RESULTS`.

**`POST /products`**

```jsonc
// request — updatedBy comes from the session, not the client
{ "barcode": "8041520233", "name": "Wajan Besi Tuang 25 cm", "price": 285000 }
```
`201` with the created product. `409 BARCODE_TAKEN` if a live product already holds that barcode.
Validation mirrors `handleSave`: non-empty `barcode`, non-empty `name`, `price > 0`.

**`PATCH /products/{id}`** — partial body of the same shape; `200` with the updated product,
`404` / `409` as above.

**`DELETE /products/{id}`** — sets `is_active = false`, returns `204`.

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
unknown barcode. Server-side, this is an upsert honoring the merge rule in §2.1.

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

**`POST /transactions`** — the critical path. Atomically: lock the register row, allocate
`saleNumber`, recompute `total` from the cart's lines, copy lines into `transaction_lines`,
delete the open sale, commit.

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

**`GET /transactions/summary`** — accepts the same `from` / `to`. Returns exactly what
`TransactionsStatStrip` renders:

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
    models.py              # §2
    schemas/               # Pydantic v2, camelCase aliases
      product.py  sale.py  transaction.py  auth.py  common.py
    routers/
      auth.py  products.py  open_sales.py  transactions.py  registers.py
    services/
      sale_numbers.py      # locked allocation
      checkout.py          # the commit transaction
    dependencies.py        # current_session / current_cashier
    seed.py                # ports frontend/lib/data/seed-*.ts for dev
  alembic/
```

Dependencies to add to the currently-empty `pyproject.toml`: `fastapi`, `uvicorn[standard]`,
`sqlalchemy>=2.0`, `alembic`, `pydantic-settings`, `psycopg[binary]` (or `aiosqlite` for local),
`argon2-cffi` or `passlib[bcrypt]`, `python-multipart`.

## 5. Suggested build order

1. Config, database, `Base`, Alembic baseline.
2. `Register` + `Cashier` + `Session`; `/api/auth/*`; point the existing server action at it.
3. `Product` + all of `/api/products`; swap `products-store.ts` to fetch. Lowest-risk slice —
   the catalog has no cross-entity invariants.
4. `OpenSale` / `OpenSaleLine` + `/api/open-sales`; move `sales-store.ts` to server-backed carts.
5. `Transaction` / `TransactionLine`, the locked sale-number allocator, and the checkout service.
   This closes the `saleNumber: null` gap from §1.4.
6. Void, summary, reprint.
7. Port the seed fixtures so dev data matches what the frontend ships with today.
