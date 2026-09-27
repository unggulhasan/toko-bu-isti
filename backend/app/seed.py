"""Development seed data, ported from frontend/lib/data/seed-*.ts.

Usage:
    uv run python -m app.seed [--reset]

Keeps dev data matching what the frontend ships with today, minus registerId
(spec 1.6), so the UI looks the same once it is pointed at the API. Product data
is the curated demo fixtures below (referenced by the seeded transactions and
open carts) plus the shop's real catalog loaded from data/products_niaga.csv.
"""

from __future__ import annotations

import argparse
import csv
import sys
import uuid
from datetime import datetime, time, timezone
from pathlib import Path

from sqlalchemy import delete, func, select, text

from .database import SessionLocal, engine
from .models import (
    Cashier,
    OpenSale,
    OpenSaleLine,
    Product,
    Transaction,
    TransactionLine,
    TransactionStatus,
)

# --- Cashiers -----------------------------------------------------------------
# The authoritative PIN -> cashier pairs (spec 3.1). Note these are NOT the names
# on the seeded transactions below; see the comment there.
CASHIERS = [("1234", "Kasir 1"), ("7890", "Kasir 2")]

# --- Products -----------------------------------------------------------------
# All 18 from seed-products.ts, verbatim barcodes/names/prices.
# The fixtures' updatedAt is a bare "2026-09-12" date; stored as midnight UTC so it
# serializes back as "2026-09-12T00:00:00Z".
PRODUCT_UPDATED_AT = datetime(2026, 9, 12, 0, 0, 0)
PRODUCT_UPDATED_BY = "Shita Mira"

PRODUCTS: list[tuple[str, str, int]] = [
    ("8041520094", "Mug Keramik Sand", 95000),
    ("8041520117", "Serbet Linen", 65000),
    ("8041520201", "Lilin Lebah 170 gr", 115000),
    ("8041520233", "Wajan Besi Tuang 25 cm", 285000),
    ("8041520295", "Sendok Kayu Zaitun", 48000),
    ("8041520344", "Mangkuk Stoneware", 135000),
    ("8041520390", "Selimut Wol Slate", 630000),
    ("8041520411", "Pembuka Botol Kuningan", 75000),
    ("8041520458", "Talenan Kayu Jati", 165000),
    ("8041520472", "Gelas Kaca Borosilikat", 55000),
    ("8041520509", "Keranjang Rotan Kecil", 145000),
    ("8041520536", "Piring Keramik Putih", 85000),
    ("8041520563", "Teko Keramik Glaze", 225000),
    ("8041520590", "Sarung Bantal Linen", 95000),
    ("8041520617", "Vas Bunga Terakota", 110000),
    ("8041520644", "Toples Kaca Bertutup", 68000),
    ("8041520671", "Sikat Kayu Serbaguna", 38000),
    ("8041520698", "Alas Piring Anyaman", 42000),
]

# --- Transactions -------------------------------------------------------------
# All 7 from seed-transactions.ts (saleNumbers 1036-1042, one voided).
#
# The cashier NAMES here ("Shita Mira", "A. Pratama") are deliberately not the two
# PIN cashiers above. That is not an inconsistency to fix: transactions.cashier_name
# is denormalized and cashier_id is nullable with ON DELETE SET NULL precisely so a
# historical receipt can name someone no longer on staff. These rows are seeded with
# cashier_id = NULL and their original names, reproducing today's UI verbatim.
#
# Each entry: (sale_number, cashier_name, status, hour, minute, tendered, lines)
# where lines are (barcode, qty).
#
# NOTE ON t-1037: its fixture `total` (560000) does NOT equal its line sum (625000)
# -- a 65000 discrepancy, one "Serbet Linen", in the frontend fixture. The seed
# derives every total from its lines instead of copying the fixture value, because
# transaction_lines is what the receipt renders and what `gross` sums; copying the
# stale total would make the summary's gross and cashInDrawer disagree. Its tendered
# is raised to cover the corrected total.
TRANSACTIONS: list[tuple[int, str, str, int, int, int, list[tuple[str, int]]]] = [
    (1042, "Shita Mira", "completed", 14, 8, 630000,
     [("8041520094", 1), ("8041520201", 2), ("8041520233", 1)]),
    (1041, "Shita Mira", "completed", 13, 52, 115000, [("8041520201", 1)]),
    (1040, "A. Pratama", "voided", 13, 30, 345000,
     [("8041520344", 2), ("8041520411", 1)]),
    (1039, "A. Pratama", "completed", 12, 57, 1050000,
     [("8041520390", 1), ("8041520094", 2), ("8041520295", 4)]),
    (1038, "A. Pratama", "completed", 12, 14, 150000, [("8041520117", 2)]),
    # tendered raised from the fixture's 600000: see the t-1037 note above -- the
    # corrected, line-derived total exceeds it.
    (1037, "Shita Mira", "completed", 11, 46, 700000,
     [("8041520233", 1), ("8041520344", 1), ("8041520117", 2), ("8041520411", 1)]),
    (1036, "Shita Mira", "completed", 11, 9, 75000, [("8041520411", 1)]),
]

# --- Open sales ---------------------------------------------------------------
# The 3 parked carts from seed-sales.ts, as (barcode, qty) lists.
OPEN_SALES: list[list[tuple[str, int]]] = [
    [("8041520233", 1), ("8041520201", 2), ("8041520094", 1), ("8041520390", 1),
     ("8041520117", 2), ("8041520344", 2), ("8041520411", 1), ("8041520458", 1),
     ("8041520472", 4), ("8041520509", 1), ("8041520536", 6), ("8041520563", 1),
     ("8041520590", 2), ("8041520617", 1), ("8041520644", 3), ("8041520671", 2),
     ("8041520698", 4)],
    [("8041520094", 1), ("8041520411", 1)],
    [("8041520344", 2), ("8041520201", 2), ("8041520117", 1)],
]

# The generator must be left so its next allocation is 1043, continuing the seeded
# fixtures. Seeding sale_number 1036-1042 does not consume generator values -- the
# generator is entirely independent of the column.
NEXT_SALE_NUMBER = 1043

# --- Real catalog ---------------------------------------------------------------
# The shop's actual product catalog, exported from their old point-of-sale system.
# Loaded from CSV rather than inlined: ~5.5k rows would dwarf the rest of this file.
CATALOG_CSV_PATH = Path(__file__).parent / "data" / "products_niaga.csv"


def _load_catalog_products() -> list[tuple[str, str, int]]:
    with CATALOG_CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [
            (row["barcode"].strip(), row["name"].strip().upper(), int(row["price"]))
            for row in reader
        ]


def _uuid() -> str:
    return str(uuid.uuid4())


def _today_at(hour: int, minute: int) -> datetime:
    """Today at the fixture's wall-clock time, stored as naive UTC.

    The fixtures' isoAt() sets a LOCAL time, but everything in this database is
    stored in UTC (Firebird's CURRENT_TIMESTAMP returns UTC on this server, and the
    API's date filters use UTC days). Converting local -> UTC here would push the
    earlier fixtures onto the previous UTC day in a positive-offset zone like
    Asia/Jakarta, so they would vanish from the transactions page's default "today"
    window. The hour is therefore treated as a UTC wall time: the receipts stay
    inside today and keep their relative ordering, which is what the fixtures are
    demonstrating.
    """
    return datetime.combine(datetime.now(timezone.utc).date(), time(hour, minute))


def reset(db) -> None:
    """Delete all rows in FK-safe order and rewind the generator."""
    for model in (TransactionLine, Transaction, OpenSaleLine, OpenSale, Product, Cashier):
        db.execute(delete(model))
    db.commit()
    with engine.begin() as conn:
        conn.execute(text(f"ALTER SEQUENCE gen_sale_number RESTART WITH {NEXT_SALE_NUMBER}"))
    print(f"reset: all rows deleted, gen_sale_number next = {NEXT_SALE_NUMBER}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--reset", action="store_true", help="delete existing rows first")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.reset:
            reset(db)

        existing = db.scalar(select(func.count()).select_from(Product)) or 0
        if existing:
            print(
                f"Refusing to seed: {existing} product(s) already present. "
                "Pass --reset to replace them.",
                file=sys.stderr,
            )
            return 1

        # Cashiers. The cashiers_bi_bu trigger fills pin_active.
        for pin, name in CASHIERS:
            db.add(Cashier(id=_uuid(), name=name, pin=pin, is_active=True, pin_active=pin))

        # Products. Real UUIDs, not the fixtures' `p-<barcode>` ids: the column is
        # CHAR(36) CHARACTER SET OCTETS, so a 13-char id would be space-padded to 36
        # and every later equality comparison would hinge on trailing-space
        # semantics. The frontend declares `id: string` and never parses it.
        #
        # PRODUCTS (curated demo fixtures, referenced by TRANSACTIONS/OPEN_SALES
        # above) is combined with the real catalog loaded from CSV. The two are
        # disjoint today; this guard catches it if that ever stops being true.
        catalog_products = _load_catalog_products()
        curated_products = [
            (barcode.strip(), name.strip().upper(), price)
            for barcode, name, price in PRODUCTS
        ]
        all_products = curated_products + catalog_products
        seen_barcodes: dict[str, str] = {}
        for barcode, name, _price in all_products:
            if barcode in seen_barcodes:
                raise SystemExit(
                    f"seed bug: barcode {barcode!r} used by both "
                    f"{seen_barcodes[barcode]!r} and {name!r}"
                )
            seen_barcodes[barcode] = name

        by_barcode: dict[str, Product] = {}
        for barcode, name, price in all_products:
            product = Product(
                id=_uuid(),
                barcode=barcode,
                name=name,
                price=price,
                is_active=True,
                barcode_active=barcode,
                updated_by=PRODUCT_UPDATED_BY,
                created_at=PRODUCT_UPDATED_AT,
                updated_at=PRODUCT_UPDATED_AT,
            )
            by_barcode[barcode] = product
            db.add(product)
        db.flush()

        # Transactions, with totals derived from lines (see the note above).
        for sale_number, cashier_name, status, hour, minute, tendered, lines in TRANSACTIONS:
            merged: dict[str, int] = {}
            for barcode, qty in lines:
                merged[barcode] = merged.get(barcode, 0) + qty

            total = sum(by_barcode[b].price * q for b, q in merged.items())
            if tendered < total:
                raise SystemExit(
                    f"seed bug: #{sale_number} tendered {tendered} < derived total {total}"
                )
            created = _today_at(hour, minute)
            is_voided = status == "voided"
            txn = Transaction(
                id=_uuid(),
                sale_number=sale_number,
                cashier_id=None,
                cashier_name=cashier_name,
                total=total,
                tendered=tendered,
                change=tendered - total,
                status=TransactionStatus.voided if is_voided else TransactionStatus.completed,
                created_at=created,
                voided_at=created if is_voided else None,
                voided_by=cashier_name if is_voided else None,
            )
            db.add(txn)
            db.flush()
            for pos, (barcode, qty) in enumerate(merged.items()):
                product = by_barcode[barcode]
                db.add(
                    TransactionLine(
                        id=_uuid(),
                        transaction_id=txn.id,
                        product_id=product.id,
                        barcode=product.barcode,
                        name=product.name,
                        price=product.price,
                        qty=qty,
                        line_total=product.price * qty,
                        position=pos,
                    )
                )

        # Open carts. Shop-wide, not per terminal (spec 1.6).
        for position, lines in enumerate(OPEN_SALES):
            sale = OpenSale(id=_uuid(), position=position)
            db.add(sale)
            db.flush()
            for pos, (barcode, qty) in enumerate(lines):
                product = by_barcode[barcode]
                db.add(
                    OpenSaleLine(
                        id=_uuid(),
                        sale_id=sale.id,
                        product_id=product.id,
                        barcode=product.barcode,
                        name=product.name,
                        price=product.price,
                        qty=qty,
                        position=pos,
                    )
                )

        db.commit()
    finally:
        db.close()

    with engine.connect() as conn:
        current = conn.execute(text("SELECT gen_id(gen_sale_number, 0) FROM rdb$database")).scalar()
    print(
        f"Seeded {len(CASHIERS)} cashiers, {len(all_products)} products "
        f"({len(PRODUCTS)} curated + {len(catalog_products)} from catalog), "
        f"{len(TRANSACTIONS)} transactions, {len(OPEN_SALES)} open carts.\n"
        f"gen_sale_number at {current} -- next sale is {current + 1}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
