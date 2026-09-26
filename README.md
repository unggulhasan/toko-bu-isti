# Toko Bu Isti — POS

A single-store, keyboard-first point-of-sale system: a Next.js frontend, a FastAPI
backend, and a Firebird 5 database, running on one Windows PC in the shop and
served over a direct LAN cable to a second PC used as a plain browser terminal.

## How it's deployed

Two PCs, one cable, no internet:

| PC | Role | Runs |
| --- | --- | --- |
| **Server PC** | Has the receipt printer (Epson TM-U220D, USB) attached | Firebird, FastAPI backend, Next.js frontend |
| **Client PC** | Cashier terminal | Nothing — just a browser pointed at the server PC's LAN IP |

The client PC needs no install of any kind: no Node, no Python, no repo checkout.
It's a dumb terminal — open a browser, type the server's IP, done. Everything
(POS UI and API) is served by the one Next.js process on the server PC; the
browser never talks to FastAPI directly, only to Next.js, which proxies `/api/*`
requests to FastAPI server-side (see [frontend/next.config.ts](frontend/next.config.ts)).

## Quick Start — deploying to the server PC (Windows)

These steps take a fresh Windows PC to a running till. Run them in order.

### 1. Install Firebird 5 (64-bit)

Download the Firebird 5 Windows server installer from
[firebirdsql.org](https://firebirdsql.org/en/firebird-5-0/) and run it.

- Pick the **Server** install (not Classic-only/client-only) — this PC hosts the database.
- Use the default **SuperServer** mode.
- When asked, let the installer register Firebird as a **Windows service** so it
  starts automatically on boot, before anyone logs in.
- Tick **"copy fbclient.dll to the `<system>` directory"** if offered — this lets
  the backend find the client library without extra configuration.
- Note the SYSDBA password you set (default is `masterkey`; change it if you
  want, but then update `DATABASE_URL` in step 5 to match).
- **Architecture must match your Python install** (see step 2) — 64-bit Firebird
  with 64-bit Python. Mismatched architectures fail with a misleading
  `WinError 193` that doesn't mention architecture at all.

### 2. Install Python 3.12+ and `uv`

Install Python 3.12 or newer from [python.org](https://www.python.org/downloads/)
(64-bit), then install `uv` (the backend's package/venv manager) by following
[astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) —
typically, from PowerShell:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 3. Install Node.js LTS

Install the current LTS release from [nodejs.org](https://nodejs.org/) — this
provides `node` and `npm`, needed to build and run the frontend.

### 4. Get the code onto the PC

Copy or clone this repository onto the server PC, e.g. to `C:\toko-bu-isti`.
Everything below assumes commands run from the repo root unless stated otherwise.

### 5. Configure the backend

```powershell
cd backend
copy .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — set the path to where the `.fdb` file should live, e.g.
  `firebird+firebird://SYSDBA:masterkey@localhost:3050//C:/toko-bu-isti/backend/toko.fdb`
  (note the doubled slash before the absolute path).
- `PRINTER_BACKEND=usb` — switches from the dev network-printer emulator to the
  real USB-attached TM-U220D.
- Leave `CORS_ORIGINS`, `API_HOST`, `API_PORT` at their defaults — see the
  comments in `.env.example` for why those no longer need to change between dev
  and production under this topology.

Install dependencies:

```powershell
uv sync
```

### 6. Create the database

Double-click **[backend/setup-database.bat](backend/setup-database.bat)**. This
creates the `.fdb` file at the path set in `DATABASE_URL`, applies the schema,
and runs a healthcheck to confirm everything connects. Run this once, before the
first `buka-kasir.bat` — it's safe to double-click again later, since it refuses
to touch a database that already exists.

Optionally load starter data afterwards: `uv run python -m app.seed --reset`
(only for a fresh/demo database — don't run this against real shop data).

### 7. Configure and build the frontend

```powershell
cd ..\frontend
copy .env.example .env
npm install
npm run build
```

`.env`'s `API_ORIGIN` should stay `http://127.0.0.1:8000` — see the comment in
`.env.example` for why.

### 8. Give the server PC a static LAN IP

Set a fixed IP on the network adapter connected to the crossover cable (e.g.
`192.168.1.10`), so the client PC's browser bookmark never breaks. Note this IP
for step 10.

### 9. Connect the printer

Plug the Epson TM-U220D into the server PC via USB. No driver install is
needed — the backend auto-detects it as a USB Printer Class device (see
[backend/app/services/printer.py](backend/app/services/printer.py)). If the shop
ever has more than one USB printer attached, set `PRINTER_USB_VENDOR_ID` /
`PRINTER_USB_PRODUCT_ID` in `backend/.env`.

### 10. Open the till

Double-click **[buka-kasir.bat](buka-kasir.bat)** at the repo root. It starts the
backend and frontend (each in its own visible console window) and opens a
browser to the POS. Leave both windows open while the shop is running.

To close up, double-click **[tutup-kasir.bat](tutup-kasir.bat)**, or just close
the two console windows.

### 11. Set up the client PC

On the second PC: connect it to the server PC via the crossover cable, give it a
static IP on the same subnet (e.g. `192.168.1.11`), and open a browser to
`http://192.168.1.10:3000` (the server PC's IP from step 8). Bookmark it. That's
the entire client-side setup — nothing to install.

### Updating later

When the code changes, on the server PC:

```powershell
git pull
cd backend  && uv sync
cd ..\frontend && npm install && npm run build
```

Then close and reopen the till (`tutup-kasir.bat` then `buka-kasir.bat`).

## Project layout

- [backend/](backend/) — FastAPI + SQLAlchemy 2.0 on Firebird 5. See
  [backend/README.md](backend/README.md) for architecture notes, Firebird
  quirks, and macOS dev setup.
- [frontend/](frontend/) — Next.js + shadcn/ui. See
  [frontend/README.md](frontend/README.md).
- [buka-kasir.bat](buka-kasir.bat) / [tutup-kasir.bat](tutup-kasir.bat) — open/close
  the till on the server PC.
- [backend/setup-database.bat](backend/setup-database.bat) — one-time database
  creation on a fresh server PC.

## Development (macOS)

Development happens on macOS; production is Windows-only. See
[backend/README.md](backend/README.md) for the macOS Firebird client-library
shims needed only in dev, and run the backend and frontend each with their own
`dev` workflow (`uv run python main.py` / `npm run dev`) rather than the
production `.bat` scripts, which assume a Windows environment and pre-built
frontend.
