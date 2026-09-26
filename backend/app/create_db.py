"""Create the .fdb file that DATABASE_URL points at.

Usage:
    uv run python -m app.create_db [--force]

`create_engine` (app/database.py) only ever *connects*; Firebird has no
CREATE DATABASE IF NOT EXISTS equivalent via the SQLAlchemy dialect, so a fresh
shop PC needs this run once, before app.schema_bootstrap, before anything else
in the database can exist. Refuses to run against a file that already exists
unless --force -- the same "don't clobber real data" posture as schema_bootstrap.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy.engine import make_url

# Imported for its side effect: this applies the macOS client-library shims
# (libtommath preload, WireCrypt config) before firebird.driver is used below.
# create_engine() itself is lazy -- it doesn't open a connection at import time --
# so this is safe even though the .fdb doesn't exist yet.
from . import database  # noqa: F401
from .config import settings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--force",
        action="store_true",
        help="overwrite the database file if it already exists",
    )
    args = ap.parse_args()

    # firebird-driver's create_database() takes a DSN plus discrete
    # user/password/charset arguments, not a SQLAlchemy URL string -- so pull
    # the pieces back out of DATABASE_URL rather than hand-parsing it twice.
    url = make_url(settings.database_url)
    dsn = f"{url.host}/{url.port}:{url.database}" if url.port else f"{url.host}:{url.database}"

    # Only meaningful for a local path (the shop's setup); a remote DSN's file
    # existence can't be checked from here, so let create_database's own
    # overwrite guard handle that case.
    db_path = Path(url.database) if url.database and Path(url.database).is_absolute() else None
    if db_path is not None and db_path.exists() and not args.force:
        print(
            f"{db_path} already exists. Refusing to overwrite.\n"
            "Pass --force to recreate it (this destroys all data in it), or "
            "point DATABASE_URL at a different file.",
            file=sys.stderr,
        )
        return 1

    from firebird.driver import create_database  # noqa: PLC0415 - after config/shims load

    print(f"Creating database: {dsn}")
    conn = create_database(
        dsn,
        user=url.username,
        password=url.password,
        charset="UTF8",
        overwrite=args.force,
    )
    conn.close()
    print("Database created. Next: uv run python -m app.schema_bootstrap")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
