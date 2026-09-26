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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, open_sales, products, transactions

app = FastAPI(
    title="Toko Bu Isti POS API",
    version="0.1.0",
    description="Backend for a single-store, keyboard-first kasir.",
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

    # Host comes from config so nobody types --host 0.0.0.0: bind to loopback in
    # dev and to the server laptop's static LAN IP in production (spec 3.0).
    uvicorn.run(app, host=settings.api_host, port=settings.api_port)
