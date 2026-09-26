"""Verify the driver / client-library / database chain.

Usage:
    uv run python -m app.healthcheck

Run this as the FIRST action on a new machine, before anything else ships there.
The client-library resolution differs completely between macOS and Windows and
cannot be validated from the other platform (spec 4), so this exists as a script
rather than a manual checklist.
"""

from __future__ import annotations

import sys

EXPECTED_TABLES = {
    "CASHIERS",
    "OPEN_SALES",
    "OPEN_SALE_LINES",
    "PRODUCTS",
    "TRANSACTIONS",
    "TRANSACTION_LINES",
}

_failures: list[str] = []


def ok(label: str, value: object = "") -> None:
    print(f"  ok    {label}{f': {value}' if value != '' else ''}")


def fail(label: str, detail: object) -> None:
    print(f"  FAIL  {label}: {detail}", file=sys.stderr)
    _failures.append(label)


def main() -> int:
    print(f"platform: {sys.platform}")
    print(f"python:   {sys.version.split()[0]}")

    # 1. The driver imports, and the client library actually loads. On macOS this
    #    is what the libtommath preload in app.database exists to make work.
    try:
        from .database import engine  # noqa: PLC0415 - import is part of the check
    except Exception as exc:  # noqa: BLE001
        fail("import app.database (client library)", exc)
        return 1
    ok("import app.database")

    try:
        from firebird.driver import driver_config  # noqa: PLC0415

        ok("fb_client_library", driver_config.fb_client_library.value or "<default lookup>")
    except Exception as exc:  # noqa: BLE001
        fail("read driver_config", exc)

    from sqlalchemy import text  # noqa: PLC0415

    # 2. A real connection, and the server/database facts worth asserting.
    try:
        conn_ctx = engine.connect()
    except Exception as exc:  # noqa: BLE001
        fail("connect", exc)
        return 1

    with conn_ctx as conn:
        ok("connect")

        def scalar(sql: str):
            return conn.execute(text(sql)).scalar()

        try:
            version = scalar("SELECT rdb$get_context('SYSTEM','ENGINE_VERSION') FROM rdb$database")
            if str(version).startswith("5."):
                ok("engine version", version)
            else:
                fail("engine version", f"{version} (expected 5.x)")
        except Exception as exc:  # noqa: BLE001
            fail("engine version", exc)

        try:
            charset = str(scalar("SELECT rdb$character_set_name FROM rdb$database")).strip()
            if charset == "UTF8":
                ok("charset", charset)
            else:
                fail("charset", f"{charset} (expected UTF8)")
        except Exception as exc:  # noqa: BLE001
            fail("charset", exc)

        try:
            page_size = scalar("SELECT mon$page_size FROM mon$database")
            if int(page_size) >= 8192:
                ok("page size", page_size)
            else:
                fail("page size", f"{page_size} (expected >= 8192)")
        except Exception as exc:  # noqa: BLE001
            fail("page size", exc)

        # 3. Schema presence.
        try:
            found = {
                str(r[0]).strip()
                for r in conn.execute(
                    text("SELECT rdb$relation_name FROM rdb$relations WHERE rdb$system_flag = 0")
                )
            }
            missing = EXPECTED_TABLES - found
            if missing:
                fail("tables", f"missing {sorted(missing)} -- run app.schema_bootstrap")
            else:
                ok("tables", f"{len(EXPECTED_TABLES)} present")
        except Exception as exc:  # noqa: BLE001
            fail("tables", exc)

        try:
            triggers = {
                str(r[0]).strip()
                for r in conn.execute(
                    text("SELECT rdb$trigger_name FROM rdb$triggers WHERE rdb$system_flag = 0")
                )
            }
            missing = {"PRODUCTS_BI_BU", "CASHIERS_BI_BU"} - triggers
            if missing:
                fail("triggers", f"missing {sorted(missing)}")
            else:
                ok("triggers", "products_bi_bu, cashiers_bi_bu")
        except Exception as exc:  # noqa: BLE001
            fail("triggers", exc)

        # 4. The generator. gen_id(..., 0) READS without consuming -- never use
        #    NEXT VALUE FOR here, or every healthcheck run burns a receipt number.
        try:
            current = scalar("SELECT gen_id(gen_sale_number, 0) FROM rdb$database")
            ok("gen_sale_number", f"at {current} (next sale is {current + 1})")
        except Exception as exc:  # noqa: BLE001
            fail("gen_sale_number", exc)

        # 5. Row counts, informational.
        try:
            counts = {
                t: scalar(f"SELECT COUNT(*) FROM {t}")  # noqa: S608 - fixed identifiers
                for t in ("cashiers", "products", "open_sales", "transactions")
            }
            ok("row counts", counts)
        except Exception as exc:  # noqa: BLE001
            fail("row counts", exc)

    if _failures:
        print(f"\n{len(_failures)} check(s) FAILED: {', '.join(_failures)}", file=sys.stderr)
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
