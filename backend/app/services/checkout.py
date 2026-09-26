"""The checkout transaction -- the critical write path."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..errors import empty_sale, insufficient_tender, open_sale_not_found
from ..models import (
    Cashier,
    OpenSale,
    Transaction,
    TransactionLine,
    TransactionStatus,
)
from .sale_numbers import allocate_sale_number, with_retry


def commit_sale(db: Session, open_sale_id: str, tendered: int, cashier: Cashier) -> Transaction:
    """Commit an open sale as a cash payment, in one database transaction.

    Allocates the sale number, recomputes the total from the cart's lines, copies
    those lines into transaction_lines, deletes the open sale, and commits. Wrapped
    in with_retry so a Firebird lock conflict on the open-sale rows retries rather
    than surfacing as a 500.
    """

    def _run() -> Transaction:
        sale = db.scalar(
            select(OpenSale)
            .options(selectinload(OpenSale.lines))
            .where(OpenSale.id == open_sale_id)
        )
        if sale is None:
            # Already committed or discarded.
            raise open_sale_not_found()
        if not sale.lines:
            # The UI disables pay on an empty cart, but enforce it here too.
            raise empty_sale()

        # Recomputed server-side, never taken from the request: a client-supplied
        # total is an opportunity to charge the wrong amount.
        total = sum(line.price * line.qty for line in sale.lines)
        if tendered < total:
            raise insufficient_tender(total=total, tendered=tendered)

        # Allocated only after the validation gates above, so a rejected checkout
        # does not burn a number. A rollback after this point still does -- gaps in
        # the receipt sequence are accepted (see allocate_sale_number).
        sale_number = allocate_sale_number(db)

        txn = Transaction(
            sale_number=sale_number,
            cashier_id=cashier.id,
            # Denormalized: must not change if the cashier is later renamed or
            # deactivated.
            cashier_name=cashier.name,
            total=total,
            tendered=tendered,
            change=tendered - total,
            status=TransactionStatus.completed,
        )
        db.add(txn)
        db.flush()

        for line in sale.lines:
            db.add(
                TransactionLine(
                    transaction_id=txn.id,
                    product_id=line.product_id,
                    # Snapshots carried across verbatim -- joining to products at
                    # read time would rewrite history the moment a price changes.
                    barcode=line.barcode,
                    name=line.name,
                    price=line.price,
                    qty=line.qty,
                    line_total=line.price * line.qty,
                    position=line.position,
                )
            )

        db.delete(sale)  # lines cascade
        db.commit()
        return txn

    return with_retry(_run, db)
