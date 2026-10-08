"""In-place upgrades for databases created before a schema.sql change.

schema.sql stays the source of truth for fresh installs; this module only brings
an already-deployed database up to the same shape, and is a no-op once it has.
It runs from the app's startup hook, so updating the shop PC needs no manual
isql step.

Every step is guarded by an existence check (Firebird has no ADD COLUMN IF NOT
EXISTS) and runs in its own transaction, mirroring schema_bootstrap: Firebird
cannot always alter an object and then use it within one transaction. Each step
is checked on its own, so a crash halfway through is finished on the next start.
"""

from __future__ import annotations

from sqlalchemy import text

from .database import engine


def _exists(sql: str, **params: str) -> bool:
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar() is not None


def _column_exists(table: str, column: str) -> bool:
    return _exists(
        "SELECT 1 FROM rdb$relation_fields "
        "WHERE TRIM(rdb$relation_name) = :t AND TRIM(rdb$field_name) = :c",
        t=table.upper(),
        c=column.upper(),
    )


def _constraint_exists(name: str) -> bool:
    return _exists(
        "SELECT 1 FROM rdb$relation_constraints WHERE TRIM(rdb$constraint_name) = :n",
        n=name.upper(),
    )


def _index_exists(name: str) -> bool:
    return _exists(
        "SELECT 1 FROM rdb$indices WHERE TRIM(rdb$index_name) = :n",
        n=name.upper(),
    )


def _run(ddl: str) -> None:
    with engine.begin() as conn:
        conn.execute(text(ddl))


def add_open_sales_cashier() -> None:
    """open_sales.cashier_id: carts belong to the cashier who created them.

    Pre-existing carts keep a NULL owner, so they are visible to nobody. That is
    deliberate -- guessing an owner would hand one cashier another's cart.
    """
    if not _column_exists("open_sales", "cashier_id"):
        _run("ALTER TABLE open_sales ADD cashier_id CHAR(36) CHARACTER SET OCTETS")
    if not _constraint_exists("fk_open_sales_cashier"):
        _run(
            "ALTER TABLE open_sales ADD CONSTRAINT fk_open_sales_cashier "
            "FOREIGN KEY (cashier_id) REFERENCES cashiers (id) ON DELETE SET NULL"
        )
    if not _index_exists("ix_open_sales_cashier_id"):
        _run("CREATE INDEX ix_open_sales_cashier_id ON open_sales (cashier_id)")


def add_cashier_session_columns() -> None:
    """cashiers.session_token / session_seen_at: one live login per PIN.

    Existing rows start NULL (nobody signed in). Browsers that were logged in
    before the upgrade hold no token, so the frontend's persisted-session version
    bump signs them out once.
    """
    if not _column_exists("cashiers", "session_token"):
        _run("ALTER TABLE cashiers ADD session_token VARCHAR(64)")
    if not _column_exists("cashiers", "session_seen_at"):
        _run("ALTER TABLE cashiers ADD session_seen_at TIMESTAMP")


def migrate() -> None:
    # Before schema_bootstrap has run there is nothing to upgrade, and the
    # healthcheck/bootstrap commands should report that, not crash here.
    if not _exists(
        "SELECT 1 FROM rdb$relations "
        "WHERE TRIM(rdb$relation_name) = 'OPEN_SALES' AND rdb$system_flag = 0"
    ):
        return
    add_open_sales_cashier()
    add_cashier_session_columns()
