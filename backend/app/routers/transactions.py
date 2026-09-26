"""Committed sales. All routes are `def`, never `async def` (spec 2.0)."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..dependencies import CurrentCashier, DbSession
from ..errors import already_voided, printer_unavailable, transaction_not_found
from ..models import Transaction, TransactionLine, TransactionStatus
from ..schemas.common import Page, paginate
from ..schemas.transaction import (
    CheckoutRequest,
    SummaryOut,
    TransactionListItem,
    TransactionOut,
)
from ..services.checkout import commit_sale
from ..services.printer import PrinterError, get_printer, print_receipt

router = APIRouter(prefix="/transactions", tags=["transactions"])

StatusFilter = Annotated[str, Query(pattern="^(completed|voided|all)$")]


def _day_bounds(
    date_from: datetime | None, date_to: datetime | None
) -> tuple[datetime, datetime]:
    """Default to today, matching the transactions page's "today" framing.

    "Today" is computed in UTC because created_at is stored in UTC (Firebird's
    CURRENT_TIMESTAMP on this server returns UTC). Using local dates here would
    shift the window by the UTC offset and drop or include the wrong receipts.
    """
    if date_from is None:
        date_from = datetime.combine(datetime.now(timezone.utc).date(), time.min)
    if date_to is None:
        date_to = date_from + timedelta(days=1)
    return date_from, date_to


def _range_filters(date_from: datetime, date_to: datetime) -> list:
    return [Transaction.created_at >= date_from, Transaction.created_at < date_to]


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def checkout(body: CheckoutRequest, cashier: CurrentCashier, db: DbSession) -> TransactionOut:
    """Commit an open sale as a cash payment. Closes the saleNumber: null gap --
    the server allocates a monotonically increasing sale number here."""
    txn = commit_sale(db, body.open_sale_id, body.tendered, cashier)
    return TransactionOut.model_validate(_load(db, txn.id))


@router.get("", response_model=Page[TransactionListItem])
def list_transactions(
    db: DbSession,
    page: Annotated[int, Query(ge=0)] = 0,
    page_size: Annotated[int, Query(ge=1, le=200, alias="pageSize")] = 25,
    # Default "all": the table shows both completed and voided.
    status_filter: StatusFilter = "all",
    date_from: Annotated[datetime | None, Query(alias="from")] = None,
    date_to: Annotated[datetime | None, Query(alias="to")] = None,
) -> Page[TransactionListItem]:
    date_from, date_to = _day_bounds(date_from, date_to)
    filters = _range_filters(date_from, date_to)
    if status_filter != "all":
        filters.append(Transaction.status == TransactionStatus(status_filter))

    total = db.scalar(select(func.count()).select_from(Transaction).where(*filters)) or 0
    rows = db.scalars(
        select(Transaction)
        .where(*filters)
        # Sorted by the tuple, not created_at alone: Firebird's CURRENT_TIMESTAMP is
        # millisecond-precision and returns the *transaction* start time, so ties
        # are possible and sale_number resolves them deterministically.
        .order_by(Transaction.created_at.desc(), Transaction.sale_number.desc())
        .limit(page_size)
        .offset(page * page_size)
    ).all()

    # units (the "Barang" column) without shipping lines: one grouped SUM(qty)
    # over just this page's transaction ids, using the existing index on
    # transaction_lines.transaction_id.
    ids = [row.id for row in rows]
    units_by_txn: dict[str, int] = {}
    if ids:
        units_by_txn = dict(
            db.execute(
                select(TransactionLine.transaction_id, func.sum(TransactionLine.qty))
                .where(TransactionLine.transaction_id.in_(ids))
                .group_by(TransactionLine.transaction_id)
            ).all()
        )

    items = [
        TransactionListItem(
            id=row.id,
            sale_number=row.sale_number,
            total=row.total,
            tendered=row.tendered,
            change=row.change,
            units=units_by_txn.get(row.id, 0),
            cashier_name=row.cashier_name,
            created_at=row.created_at,
            status=row.status,
            voided_at=row.voided_at,
            voided_by=row.voided_by,
        )
        for row in rows
    ]
    return paginate(items, total, page, page_size)


# Declared before /{transaction_id}, or "summary" would be matched as an id.
@router.get("/summary", response_model=SummaryOut)
def summary(
    db: DbSession,
    date_from: Annotated[datetime | None, Query(alias="from")] = None,
    date_to: Annotated[datetime | None, Query(alias="to")] = None,
) -> SummaryOut:
    """The four stat-strip figures. Voided transactions are excluded from
    salesCount / gross / cashInDrawer and counted separately as voidedCount."""
    date_from, date_to = _day_bounds(date_from, date_to)
    rng = _range_filters(date_from, date_to)
    completed = [*rng, Transaction.status == TransactionStatus.completed]

    sales_count = db.scalar(select(func.count()).select_from(Transaction).where(*completed)) or 0
    cash_in_drawer = db.scalar(select(func.sum(Transaction.total)).where(*completed)) or 0
    gross = (
        db.scalar(
            select(func.sum(TransactionLine.line_total))
            .select_from(TransactionLine)
            .join(Transaction, TransactionLine.transaction_id == Transaction.id)
            .where(*completed)
        )
        or 0
    )
    voided_count = (
        db.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(*rng, Transaction.status == TransactionStatus.voided)
        )
        or 0
    )

    return SummaryOut(
        sales_count=sales_count,
        gross=int(gross),
        cash_in_drawer=int(cash_in_drawer),
        voided_count=voided_count,
    )


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: str, db: DbSession) -> TransactionOut:
    """One transaction with its lines, for the receipt panel."""
    return TransactionOut.model_validate(_load(db, transaction_id))


@router.post("/{transaction_id}/void", response_model=TransactionOut)
def void_transaction(
    transaction_id: str, cashier: CurrentCashier, db: DbSession
) -> TransactionOut:
    """Soft-void. Never a delete.

    No time limit and no cash effect: any completed transaction can be voided at
    any time, and the void does not record that money left the drawer. That is the
    deliberate simple version (spec 3.4); a money trail would be a separate
    `refunds` concept, not a wider status enum. Voiding also does not restore
    stock, because stock is not modeled.
    """
    txn = _load(db, transaction_id)
    # `==`, not `is`: the dialect hands the status column back as a plain str, so an
    # identity check against the enum member is always False and every repeat void
    # would succeed with a 200.
    if txn.status == TransactionStatus.voided:
        # Enforced server-side even though the button is disabled client-side.
        raise already_voided()

    txn.status = TransactionStatus.voided
    # UTC, to match what Firebird's CURRENT_TIMESTAMP writes into created_at on this
    # server. Stored naive because the dialect maps DateTime to TIMESTAMP without
    # zone; the Z is attached when serializing (see schemas/common.UtcDateTime).
    txn.voided_at = datetime.now(timezone.utc).replace(tzinfo=None)
    txn.voided_by = cashier.name
    db.commit()
    return TransactionOut.model_validate(_load(db, transaction_id))


@router.post("/{transaction_id}/print", status_code=status.HTTP_200_OK)
def print_transaction(transaction_id: str, db: DbSession) -> dict[str, bool]:
    """Print (or reprint) a receipt. Stateless -- no audit trail is kept, so this
    is also the reprint endpoint: a receipt is immutable once written, so printing
    it again is just re-rendering the same data (spec: TransactionLine docstring).
    """
    txn = _load(db, transaction_id)
    try:
        printer = get_printer()
        print_receipt(printer, txn)
        printer.close()
    except PrinterError:
        raise printer_unavailable()
    return {"ok": True}


def _load(db: Session, transaction_id: str) -> Transaction:
    txn = db.scalar(
        select(Transaction)
        .options(selectinload(Transaction.lines))
        .where(Transaction.id == transaction_id)
    )
    if txn is None:
        raise transaction_not_found()
    return txn
