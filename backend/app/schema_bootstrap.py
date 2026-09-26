"""Apply schema.sql to the configured database.

Usage:
    uv run python -m app.schema_bootstrap [--force]

Firebird has no CREATE TABLE IF NOT EXISTS, so this refuses to run against a
database that already has the schema unless --force is given.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import text

from .database import engine

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"
SENTINEL = "-- @@"


def statements(sql: str) -> list[str]:
    """Split on the `-- @@` sentinel, not on `;` -- the trigger bodies contain
    semicolons and naive splitting would cut them in half."""
    out = []
    for chunk in sql.split(SENTINEL):
        # Drop comment-only and blank lines; keep everything else verbatim.
        body = "\n".join(
            ln for ln in chunk.splitlines() if ln.strip() and not ln.strip().startswith("--")
        ).strip()
        if body:
            out.append(body)
    return out


def schema_present() -> bool:
    # Firebird upcases unquoted identifiers, so the stored name is 'PRODUCTS'.
    with engine.connect() as conn:
        found = conn.execute(
            text(
                "SELECT 1 FROM rdb$relations "
                "WHERE TRIM(rdb$relation_name) = 'PRODUCTS' AND rdb$system_flag = 0"
            )
        ).scalar()
    return found is not None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--force",
        action="store_true",
        help="apply even though the schema appears to exist already",
    )
    args = ap.parse_args()

    if schema_present() and not args.force:
        print(
            "Schema already present (table PRODUCTS exists). Refusing to re-apply.\n"
            "Pass --force to run anyway, or drop the objects first.",
            file=sys.stderr,
        )
        return 1

    stmts = statements(SCHEMA_PATH.read_text())
    print(f"Applying {len(stmts)} statements from {SCHEMA_PATH.name}")

    for i, stmt in enumerate(stmts, 1):
        label = " ".join(stmt.split()[:4])
        # One transaction per statement: Firebird cannot always alter and then use
        # an object within a single transaction.
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
        except Exception as exc:  # noqa: BLE001 - report and stop
            print(f"  [{i}/{len(stmts)}] FAIL  {label}", file=sys.stderr)
            print(f"        {exc}", file=sys.stderr)
            return 1
        print(f"  [{i}/{len(stmts)}] ok    {label}")

    print("Schema applied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
