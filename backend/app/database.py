"""Engine, session factory and the platform shims the Firebird client needs.

Import order in this module is load-bearing. The macOS client-library fixes must
run before anything imports firebird-driver, so they sit above the sqlalchemy
imports and those imports carry `# noqa: E402`. pyproject.toml also tells ruff to
leave this file's import order alone -- see [tool.ruff.lint.per-file-ignores].
"""

from __future__ import annotations

import ctypes
import os
import sys
from pathlib import Path

from .config import settings

# --- macOS (development only) -------------------------------------------------
# The official Firebird.framework ships its dylibs with no LC_RPATH load command,
# so their `@rpath/lib/...` references cannot be resolved and loading fails with
# "Library not loaded: @rpath/lib/libtommath.dylib -- no LC_RPATH's found".
# Two independent symptoms come out of that one defect:
#
#   1. libfbclient.dylib cannot find libtommath.dylib. Preloading it into the
#      global namespace satisfies the reference. Must happen before the driver
#      loads the client library.
#   2. The engine's own plugins (libChaCha.dylib for wire encryption, Engine13
#      for a local attach) hit the same thing when the *engine* dlopens them.
#      Preloading does not help there -- the fix is to not take that code path.
#      With `WireCrypt = Enabled` the client accepts the server's encryption
#      instead of negotiating a client-side ChaCha plugin, and the attach
#      succeeds. `Disabled` fails outright ("Incompatible wire encryption levels
#      requested on client and server") because the server requires encryption.
#
# Windows resolves fbclient.dll through PATH and needs none of this, hence the
# platform guard -- the two platforms' failure modes are unrelated (spec 4).
if sys.platform == "darwin":
    _FB_LIB = "/Library/Frameworks/Firebird.framework/Versions/A/Resources/lib"
    ctypes.CDLL(f"{_FB_LIB}/libtommath.dylib", mode=ctypes.RTLD_GLOBAL)

    # The driver reads $FIREBIRD at attach time, so setting it here -- rather than
    # requiring every launcher to export it -- is enough. Unlike DYLD_LIBRARY_PATH,
    # which the dynamic loader reads at process start and is too late to set from
    # Python, and which macOS SIP strips through some launchers anyway.
    _FBCONF = Path(__file__).resolve().parent.parent / "fbconf"
    if (_FBCONF / "firebird.conf").is_file():
        os.environ.setdefault("FIREBIRD", str(_FBCONF))

# --- Windows (production) -----------------------------------------------------
# The driver's supported override for a client library kept outside PATH. Note it
# is NOT the FIREBIRD_LIBRARY_PATH env var, which this driver does not read.
if settings.fb_client_library:
    from firebird.driver import driver_config  # noqa: E402

    driver_config.fb_client_library.value = settings.fb_client_library

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

engine = create_engine(
    settings.database_url,
    # Firebird's server-side statement cache is per-connection and the classic
    # architecture spawns a process per connection. Keep the pool modest.
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,  # drops connections the server has already reaped
    pool_recycle=1800,
    # session_time_zone pins every connection to UTC.
    #
    # Firebird stores a plain TIMESTAMP in the SESSION time zone, so a
    # server_default=CURRENT_TIMESTAMP column records local wall-clock time on
    # whatever machine the server runs on -- while application-written timestamps
    # (voided_at) are UTC. Left unpinned those two disagree by the UTC offset: on
    # this dev Mac (Australia/Melbourne) a receipt created at 17:06 was stamped
    # voided at 07:06, ten hours before it existed. It would also make the
    # database's notion of "today" -- and so the transactions page's default date
    # window -- depend on the machine's locale.
    #
    # UTC end to end: stored naive, serialized with a trailing Z by the Pydantic
    # layer (schemas/common.UtcDateTime).
    connect_args={"charset": "UTF8", "session_time_zone": "UTC"},
)

# expire_on_commit=False: routes commit and then serialize the ORM object into a
# Pydantic response. Under the default, that serialization would re-fetch every
# attribute -- a round trip per field over a blocking driver.
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    """FastAPI dependency. Deliberately does not commit: each route owns its own
    transaction boundary, which checkout needs for its retry (spec 2.3)."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
