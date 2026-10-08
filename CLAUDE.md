# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-store, keyboard-first point-of-sale system: Next.js frontend, FastAPI backend, Firebird 5 database. Deployed to one Windows PC in the shop (the "server PC", with the receipt printer attached), served over a direct LAN cable to a second "client PC" that runs nothing but a browser. The browser only ever talks to Next.js — Next.js proxies `/api/*` to FastAPI server-side (`frontend/next.config.ts`), so there is no CORS dependency in production and no `NEXT_PUBLIC_` API URL.

Development happens on macOS; production is Windows-only. Do not assume macOS-specific shims (see below) are needed or present in production.

## Commands

### Backend (`backend/`, run with `uv`)

```bash
uv sync                                 # install deps
uv run python -m app.healthcheck        # verify driver + DB connection + schema
uv run python -m app.schema_bootstrap   # apply schema.sql (first time only; refuses if already applied)
uv run python -m app.seed --reset       # dev fixtures (deletes existing rows first) — never against real shop data
uv run python main.py                   # run dev server at http://127.0.0.1:8000 (docs at /docs)
```

There is no configured test suite, linter invocation, or formatter script in `backend/pyproject.toml` beyond a `ruff` per-file-ignore for `database.py`. There are no `*_test.py`/`test_*.py` files in this repo.

### Frontend (`frontend/`, run with `npm`)

```bash
npm install
npm run dev         # dev server at http://localhost:3000
npm run build        # production build (required before the Windows .bat scripts will serve anything)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format        # prettier --write
npm run smoke         # scripts/smoke.ts — destructive end-to-end smoke test, see below
```

`npm run smoke` hits a real running backend (`http://127.0.0.1:8000` by default, or `SMOKE_BASE=http://localhost:3000` to go through the Next.js rewrite) and exercises every endpoint in sequence, asserting wire-format details the frontend client depends on (camelCase, the one snake_case `status_filter` param, the bare-array `/products/search` response, the two error shapes, the 200-vs-204 delete asymmetry). It **creates and deletes a product, creates and voids a transaction** — only run it against a dev DB seeded with `uv run python -m app.seed --reset`, never against production data.

### Running both together (dev)

Start the backend (`uv run python main.py`) and frontend (`npm run dev`) separately — do not use the production `buka-kasir.bat`/`tutup-kasir.bat` scripts in dev; they assume Windows and a pre-built frontend.

### macOS-only: Firebird client library shims

`firebird-driver` needs the native Firebird client library, which has packaging defects on macOS (no Homebrew formula; the official `.pkg`'s dylibs ship with no `LC_RPATH`). `backend/app/database.py` works around this, guarded on `sys.platform`, and none of it runs on Windows:

1. Preloads `libtommath.dylib` via `ctypes` in `RTLD_GLOBAL` mode before anything imports the driver (otherwise `libfbclient.dylib` fails to resolve it).
2. Points `$FIREBIRD` at `backend/fbconf/firebird.conf`, which sets `WireCrypt = Enabled` — required because the engine's own ChaCha64 plugin fails to load, so the client must instead accept the server's negotiated wire encryption. `WireCrypt = Disabled` does not work; the server rejects unencrypted attaches.

If Firebird isn't running locally, start it with `sudo /Library/Frameworks/Firebird.framework/Resources/bin/firebird` (requires a password interactively). `isql` lives at `/Library/Frameworks/Firebird.framework/Resources/bin/isql`, not on `PATH`.

## Architecture

### Backend: sync FastAPI over a blocking Firebird driver

**Every route is `def`, never `async def`.** `firebird-driver` is a blocking DB-API module with no asyncio dialect; FastAPI runs sync `def` routes in its threadpool. An `async def` route doing DB work would stall the event loop, with the failure mode being diffuse slowness rather than an error — this is enforced by convention, not tooling, so preserve it in new routes.

Layout: `app/routers/*.py` (one per resource: `auth`, `products`, `open_sales`, `transactions`) → `app/schemas/*.py` (Pydantic request/response models, one file per resource plus `common.py`) → `app/models.py` (SQLAlchemy ORM, all tables in one file) → `app/services/*.py` (business logic that doesn't belong in a route: `checkout.py`, `printer.py`, `report_pdf.py`, `sale_numbers.py`). `app/dependencies.py` holds the two FastAPI dependencies used everywhere: `DbSession` and `CurrentCashier` (resolved from the `X-Cashier-Id` header). `app/errors.py` is the single error shape used across all routers: `{"detail": {"code": ..., "message": ...}}`, with messages in Indonesian where user-facing.

**Schema is `backend/schema.sql`, not Alembic** — with one exception: `app/migrations.py` runs at API startup (FastAPI lifespan) and upgrades an already-deployed DB to match schema.sql when a column was added later (idempotent, existence-checked per step). Add new in-place upgrades there *and* to schema.sql; the shop PC has no manual migration step. Applied via `app/schema_bootstrap.py`, which splits the file on a `-- @@` sentinel (not `;`, since trigger bodies contain semicolons) and runs each statement in its own transaction. Alembic autogenerate is unreliable against Firebird's `rdb$` system tables and would miss the generator, the two triggers, and the expression index — i.e. most of the interesting DDL. When adding a new deployment migration path, stamp a baseline against the current schema rather than trying to autogenerate the whole history.

**Firebird-specific patterns baked into the schema and ORM — read before touching `models.py` or writing raw SQL:**
- No partial unique indexes. "Unique among live rows" (`products.barcode`, `cashiers.pin`) is expressed via a nullable shadow column (`barcode_active`, `pin_active`) that a `BEFORE INSERT OR UPDATE` trigger keeps in sync with `is_active`, since Firebird's `UNIQUE` permits unlimited `NULL`s. This trigger fires at the DB level regardless of insert path (ORM `add()`, raw SQL, bulk insert) — application code should never set the shadow column directly.
- All ids are `CHAR(36) CHARACTER SET OCTETS`, handled via the `UUIDStr` `TypeDecorator` in `app/types.py`. The driver returns OCTETS columns as `bytes`; without the decorator, every in-memory `row.id == some_str` comparison is silently `False` while the equivalent SQL comparison succeeds. Every id column uses this type.
- No native `ENUM` — status columns are `VARCHAR` + `CHECK`, mapped with `native_enum=False`, and read back as a plain `str`. Compare with `==`, never `is`.
- Timestamps are UTC end to end. The engine connection pins `session_time_zone=UTC` (`connect_args` in `app/database.py`), because Firebird stores plain `TIMESTAMP` in the session's timezone — unpinned, a `server_default=CURRENT_TIMESTAMP` column would record the host's local wall time while application-written timestamps are UTC, silently disagreeing by the UTC offset. Serialized to JSON with a trailing `Z` by `schemas/common.UtcDateTime`.
- `CONTAINING`, not `LIKE`, for case-insensitive search — Firebird's `LIKE` is case-sensitive by default.
- Money is always `BIGINT` integer rupiah. Never `Float` / `DOUBLE PRECISION`.
- Sale numbers come from the `gen_sale_number` generator, which sits outside transaction control and never blocks. A rolled-back checkout burns its allocated number, so gaps in the receipt sequence are expected and correct — never treat a gap as a lost sale.

**Auth is a PIN lookup, not a credential exchange.** `POST /api/auth/login` issues no token and creates no server session; the frontend holds its session in `localStorage`. Routes that need to record *who* acted take the request-scoped `X-Cashier-Id` header (resolved via `CurrentCashier`): `POST`/`PATCH /products`, `POST /transactions`, `POST /transactions/{id}/void`, and every `/open-sales` route. Open-sale carts are owned by the cashier who created them (`open_sales.cashier_id`): list/get/scan/edit/delete/checkout only see the caller's own carts, and someone else's cart is a 404, not a 403. This is how two registers signed in with different PINs stay isolated — there is no register/terminal concept anywhere in the schema or API, so two registers using the *same* PIN share carts. The frontend keys the open-sales query by `cashierId` for the same reason.

**Product backup/restore are password-gated, server-side.** `GET /products/export` and `POST /products/import` require the hardcoded passwords in `app/dependencies.py` (`BACKUP_PASSWORD` / `RESTORE_PASSWORD`), sent in the `X-Backup-Password` header and answered with 403 `BACKUP_PASSWORD_INVALID` / `RESTORE_PASSWORD_INVALID`. This is a deterrent against accidental restores (a restore replaces the whole catalog), not real secrecy. Because of the header, the export can no longer be opened as a plain URL: the frontend fetches it as a Blob and saves it (`exportProducts` in `lib/api/products.ts`).

### Frontend: Next.js App Router, React Query for server state, Zustand for client-only UI state

Route groups: `app/(auth)/login`, `app/(pos)/` (main POS screen at `/`, `/products`, `/transactions`). No settings/admin page exists anywhere in the app.

- `lib/api/*.ts` — one module per resource, all going through the single `request()` wrapper in `lib/api/client.ts`. That wrapper is the only place that builds headers, JSON-encodes bodies, and normalizes errors into `ApiError` (which discriminates `kind: "app" | "validation" | "network"` — app errors carry the backend's `code` for exact-match handling like `"INSUFFICIENT_TENDER"`). A raw pre-serialized body (e.g. re-uploading a file's own text) goes through `rawBody` instead of `body`, which skips `JSON.stringify` and must NOT be sent with `Content-Type: application/json` — see the docstring on `products.import_products` in the backend for why (FastAPI parses `application/json` bodies before a raw-bytes route parameter ever sees them).
- `lib/hooks/use-*.ts` — React Query hooks wrapping the `lib/api/*` functions; this is the only layer components should call into for server data. Mutations invalidate `queryKeys.<resource>.all` on success.
- `lib/store/*.ts` — Zustand, and deliberately small: `session-store.ts` (persisted login state, no API dependency by design — the login page itself owns the `useLogin()` mutation and calls `setSession` so it can distinguish "PIN salah" from "server unreachable") and `pos-ui-store.ts` (ephemeral, unpersisted UI-only state like the selected cart line). Cart/sale contents are **not** in a store — they live in the React Query cache for open sales (`lib/hooks/use-open-sales.ts`, `use-active-sale.ts`), since the server is the source of truth for what's in a parked cart.
- `components/pos/*` — feature components for the POS screens; `components/ui/*` — shadcn/ui primitives (this project uses `@base-ui/react` under shadcn, not Radix — check a component's existing variant/size props before assuming Radix conventions apply).
- Per-page `/`-prefixed text commands (e.g. `/baru` to create a product, `/cadangan` for backup/restore, on the products page) are a small local pattern inside the relevant search-bar component (`product-search-bar.tsx`), intentionally **not** shared through `lib/commands.ts`'s `CommandName`/`TransactionCommandName` unions — those two command sets are page-scoped by design (see the comment in `lib/commands.ts`) because each page's input component has an exhaustive switch that would otherwise have to handle cases that can never fire on that page.

### Money, dates, ids across the stack

- Money: integer rupiah everywhere (backend `BIGINT`, frontend `number`), formatted for display via `lib/format.ts`'s `formatRupiah`/`parseRupiahInput`. Never a float.
- Dates: backend emits UTC ISO strings with a trailing `Z`; convert to shop-local (`Asia/Jakarta`, `config.STORE_TIMEZONE`) only for display/reports, never for storage or comparison.
- JSON is camelCase on the wire (`schemas/common.CamelModel`); Python/SQL stays snake_case. `frontend/lib/types.ts` mirrors the backend's Pydantic schemas by hand — keep them in sync when changing a schema.
