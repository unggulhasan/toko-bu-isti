"""FastAPI application for the Toko Bu Isti POS backend.

Run in development:
    uv run python main.py
    # or: uv run uvicorn main:app --reload

IMPORTANT: every route in this app is `def`, never `async def`. firebird-driver is
a blocking DB-API module and there is no asyncio Firebird dialect, so FastAPI must
run routes in its threadpool. An `async def` route making blocking DB calls stalls
the event loop -- and the symptom is diffuse slowness, not an error (spec 2.0).
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import APP_VERSION, settings
from app.migrations import migrate
from app.routers import app_ver, auth, open_sales, products, transactions


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Runs once at startup, before any request. Blocking DB work is fine here --
    # the event loop has nothing else to serve yet; the sync-routes rule above is
    # about request handlers.
    migrate()
    yield


app = FastAPI(
    title="Toko Bu Isti POS API",
    version=APP_VERSION,
    description="Backend for a single-store, keyboard-first kasir.",
    lifespan=lifespan,
)

# The frontend calls this API from the browser, so the Next.js origin must be
# allowed. In production that is two laptops -- the server laptop's own browser and
# the client laptop reaching it over the LAN -- so both origins are listed in
# CORS_ORIGINS. allow_credentials is False: there are no cookies (spec 4).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],  # includes X-Cashier-Id
)

app.include_router(app_ver.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(open_sales.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    """Cheap liveness probe.

    The frontend's fetch wrapper can use this to distinguish "server unreachable"
    from "no data" -- with no offline mode, an unreachable server is a normal
    operating state for the client laptop and must be legible to the cashier
    ("Tidak dapat menghubungi server kasir") rather than rendering an empty
    catalog (spec 6).
    """
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.api_host, port=settings.api_port)
