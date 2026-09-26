# Toko Bu Isti — POS backend

FastAPI + SQLAlchemy 2.0 on **Firebird 5**. Implements [BACKEND_SPEC.md](../BACKEND_SPEC.md).

Synchronous by design: `firebird-driver` is a blocking DB-API module and there is no
asyncio Firebird dialect, so **every route is `def`, never `async def`** — FastAPI
runs them in its threadpool. An `async def` route doing DB work stalls the event
loop, and the symptom is diffuse slowness rather than an error.

## Quick start (macOS, development)

```bash
uv sync
uv run python -m app.healthcheck        # verifies driver + connection + schema
uv run python -m app.schema_bootstrap   # first time only: applies schema.sql
uv run python -m app.seed --reset       # dev fixtures, ported from the frontend
uv run python main.py                   # http://127.0.0.1:8000  (docs at /docs)
```

`.env` (see `.env.example`):

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | `firebird+firebird://SYSDBA:masterkey@localhost:3050//abs/path/toko.fdb` — note the **doubled slash** before an absolute POSIX path |
| `CORS_ORIGINS` | Comma-separated. Must list every browser origin, including the client laptop's |
| `API_HOST` / `API_PORT` | Bind address. **Never `0.0.0.0`** — see Production |
| `FB_CLIENT_LIBRARY` | Windows only, when `fbclient.dll` is kept off `PATH` |

## The client library — the most common first-run failure

`firebird-driver` binds to the **native** Firebird client library, which is not
bundled with the wheel. It resolves differently per platform, and the two failure
modes are unrelated — neither reproduces on the other OS.

### macOS (development)

There is no Homebrew formula; use the official `.pkg` from firebirdsql.org, which
installs `/Library/Frameworks/Firebird.framework/`. Verified against **5.0.4**.

The framework's dylibs ship with **no `LC_RPATH` load command**, so their
`@rpath/lib/...` references cannot be resolved. Two symptoms follow from that one
packaging defect, and `app/database.py` handles both:

1. `libfbclient.dylib` cannot find `libtommath.dylib` →
   `OSError: dlopen(...): Library not loaded: @rpath/lib/libtommath.dylib`.
   Fixed by preloading that dylib with `ctypes` in `RTLD_GLOBAL` mode, before
   anything imports the driver.
2. The **engine's own plugins** hit it too — `Error loading plugin ChaCha64`
   (wire encryption) or `Engine13` (a local attach). Preloading does not help,
   because the engine dlopens those itself. Fixed by `fbconf/firebird.conf` with
   `WireCrypt = Enabled`, pointed at via `$FIREBIRD`, which lets the client accept
   the server's encryption instead of negotiating its own ChaCha plugin.
   `WireCrypt = Disabled` does **not** work — the server requires encryption and
   rejects the attach with "Incompatible wire encryption levels".

Two alternatives, both rejected after testing: `DYLD_LIBRARY_PATH` works only when
set before the process starts (the loader reads it at launch, and macOS SIP strips
it through some launchers), and `install_name_tool` cannot patch in an `LC_RPATH`
because the binary has no header padding.

`isql` lives at `/Library/Frameworks/Firebird.framework/Resources/bin/isql` — not on
`PATH`.

### Windows (production)

Install the Firebird 5 server (or the client package). The installer's "copy client
library to `<system>` directory" option puts `fbclient.dll` where `find_library` will
see it; otherwise add the Firebird `bin\` directory to the system `PATH`, or set
`FB_CLIENT_LIBRARY` to the DLL's full path.

**Architecture must match.** A 64-bit Python cannot load a 32-bit `fbclient.dll`, and
the error — `OSError: [WinError 193] %1 is not a valid Win32 application` — does not
say so. Install 64-bit Firebird alongside 64-bit Python.

None of the macOS shims run on Windows; they are guarded on `sys.platform`.

## Schema

`schema.sql` is the source of truth, applied by `python -m app.schema_bootstrap`.
There is no Alembic: autogenerate is unreliable against Firebird's `rdb$` system
tables and would not produce the generator, the two triggers or the expression index
at all — the majority of the interesting DDL. Add Alembic when the first real
production migration is needed, stamping a baseline against the current schema.

Statements are separated by a `-- @@` sentinel, not `;`, because the trigger bodies
contain semicolons. Each runs in its own transaction, which also satisfies Firebird's
rule that you cannot always alter and then use an object within one transaction.

Firebird-specific choices worth knowing before editing `models.py`:

- **No partial unique indexes.** "Barcode unique among live products" is expressed
  with a nullable `barcode_active` column (Firebird `UNIQUE` permits unlimited
  `NULL`s), kept in sync by the `products_bi_bu` trigger. Same for `cashiers.pin_active`.
- **Ids are `CHAR(36) CHARACTER SET OCTETS`** via the `UUIDStr` decorator in
  `app/types.py`. That decorator matters: the driver returns OCTETS columns as
  `bytes`, so without it every in-memory `row.id == some_str` is silently `False`
  while the equivalent SQL comparison succeeds.
- **`native_enum=False`** — Firebird has no `ENUM`; status is `VARCHAR(16)` + `CHECK`.
  It also reads back as a plain `str`, so compare with `==`, never `is`.
- **Timestamps are UTC end to end.** The engine pins `session_time_zone=UTC`, because
  Firebird stores a plain `TIMESTAMP` in the session zone — unpinned, a
  `server_default` column records the host's local wall time while application-written
  timestamps are UTC, and the two disagree by the UTC offset. Serialized with a
  trailing `Z` by `schemas/common.UtcDateTime`.
- **`CONTAINING`, not `LIKE`**, for search: Firebird's `LIKE` is case-sensitive.
- **Money is `BIGINT` integer rupiah.** Never `Float`, never `DOUBLE PRECISION`.
- **Sale numbers come from the `gen_sale_number` generator**, which is outside
  transaction control and never blocks. A rolled-back checkout burns its number, so
  the receipt sequence has gaps — accepted. Never treat `saleNumber` as a count of
  sales, and never flag a missing number as a lost sale.

## Auth

`POST /api/auth/login` is a **PIN lookup, not a credential exchange**: the server
issues no token and validates no session, matching a frontend that holds its session
in `localStorage`. Routes that record *who* acted take an `X-Cashier-Id` header —
the only request-context header, and needed by exactly four routes (`POST`/`PATCH`
`/products`, `POST /transactions`, `POST /transactions/{id}/void`).

This is a deliberate fit for a two-laptop POS on a private shop LAN. If the shop ever
adds remote access or needs non-repudiable actions, reinstate a server-issued token
and hash the PIN with argon2 — the `Cashier` model is shaped so that change is
additive.

There is no register/terminal concept anywhere: no table, column, header or API
field. The cashier is the only actor identified.

## Production notes (Windows)

- **Bind to the LAN IP, not `0.0.0.0`** — the client laptop must reach the server, so
  loopback is too narrow, but a wildcard bind exposes an unauthenticated API on any
  interface the laptop acquires (public Wi-Fi, tethering). Add a firewall rule
  limiting the port to the local subnet.
- **Give the server laptop a static LAN IP.** The client's API base URL and
  `CORS_ORIGINS` both hard-code it; a DHCP change breaks the client with a confusing
  CORS error.
- **Run the API as a Windows service** (NSSM or `sc.exe`), ordered *after* Firebird's
  own service, so a closed terminal window cannot take the till down mid-trade.
- **Keep the `.fdb` off OneDrive/Dropbox and off network shares.** Firebird manages
  its own file locking; a sync client writing underneath it is a documented
  corruption path.
- **Back up with `gbak -b`, not a file copy** — a copy of a live database is not
  consistent. Schedule it nightly to a separate drive. All the shop's data lives in
  this one file on this one laptop, which makes this the most important item here.
- **No offline mode.** When the server laptop is down the client is unusable; the
  client must fail *legibly* ("Tidak dapat menghubungi server kasir") rather than
  render an empty catalog.
- Run `python -m app.healthcheck` as the first deployment action on that machine.
