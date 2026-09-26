"""ESC/POS printing: connect to the configured printer and render a receipt.

Dev targets escpresso (a TCP ESC/POS emulator on localhost:9100) via the Network
backend; production targets the real Epson TM-U220D over USB. Which one is used
is a .env setting (PRINTER_BACKEND), not a code change -- see config.py.
"""

from __future__ import annotations

from datetime import timezone

from escpos.escpos import Escpos
from escpos.exceptions import Error as EscposError
from escpos.printer import Dummy, Network, Usb

from ..config import settings
from ..models import Transaction, TransactionStatus

STORE_NAME = "TOKO BU ISTI"


class PrinterError(Exception):
    """Raised when the printer is unreachable or rejects the job."""


def get_printer() -> Escpos:
    backend = settings.printer_backend
    try:
        if backend == "network":
            return Network(settings.printer_host, port=settings.printer_port)
        if backend == "usb":
            if not settings.printer_usb_vendor_id or not settings.printer_usb_product_id:
                raise PrinterError(
                    "PRINTER_USB_VENDOR_ID / PRINTER_USB_PRODUCT_ID are not set"
                )
            return Usb(
                int(settings.printer_usb_vendor_id, 16),
                int(settings.printer_usb_product_id, 16),
            )
        if backend == "dummy":
            return Dummy()
    except (EscposError, OSError, ValueError) as exc:
        raise PrinterError(str(exc)) from exc
    raise PrinterError(f"unknown PRINTER_BACKEND: {backend!r}")


def _line(printer: Escpos, left: str, right: str) -> None:
    width = 42  # 80mm paper, Font A -- matches escpresso's default and the TM-U220D
    printer.text(f"{left}{right.rjust(max(1, width - len(left)))}\n")


def print_receipt(printer: Escpos, txn: Transaction) -> None:
    """Render one Transaction to the printer. Safe to call more than once for the
    same transaction -- a receipt is immutable once written, so a reprint is just
    the same render run again (spec: TransactionLine docstring)."""

    try:
        printer.set(align="center", bold=True, width=2, height=2)
        printer.text(f"{STORE_NAME}\n")
        printer.set(align="center", bold=False, width=1, height=1)
        if txn.status == TransactionStatus.voided:
            printer.set(align="center", bold=True)
            printer.text("** DIBATALKAN **\n")
            printer.set(align="center", bold=False)

        created_at = txn.created_at.replace(tzinfo=timezone.utc)
        printer.text(f"#{txn.sale_number}\n")
        printer.text(f"{created_at.strftime('%d-%m-%Y %H:%M')}  {txn.cashier_name}\n")
        printer.text("-" * 42 + "\n")

        printer.set(align="left")
        for item in txn.lines:
            printer.text(f"{item.name}\n")
            _line(printer, f"  {item.qty} x {item.price:,.0f}".replace(",", "."), f"{item.line_total:,.0f}".replace(",", "."))

        printer.text("-" * 42 + "\n")
        _line(printer, "Total", f"{txn.total:,.0f}".replace(",", "."))
        _line(printer, "Tunai", f"{txn.tendered:,.0f}".replace(",", "."))
        _line(printer, "Kembali", f"{txn.change:,.0f}".replace(",", "."))
        printer.text("\n")

        printer.set(align="center")
        # CODE128 in hardware mode requires a code-set prefix ({A/{B/{C) ahead of
        # the payload -- {B selects Code Set B (printable ASCII), which covers a
        # plain digit string like the sale number.
        printer.barcode(f"{{B{txn.sale_number}", "CODE128", width=2, height=80, pos="BELOW")
        printer.text("\n")
        printer.cut()
    except (EscposError, OSError) as exc:
        raise PrinterError(str(exc)) from exc
