"""ESC/POS printing: connect to the configured printer and render a receipt.

Dev targets escpresso (a TCP ESC/POS emulator on localhost:9100) via the Network
backend; production targets the real Epson TM-U220D over USB. Which one is used
is a .env setting (PRINTER_BACKEND), not a code change -- see config.py.
"""

from __future__ import annotations

from datetime import timezone
from zoneinfo import ZoneInfo

import barcode as barcode_lib
from barcode.writer import ImageWriter
from escpos.escpos import Escpos
from escpos.exceptions import Error as EscposError
from escpos.printer import Dummy, Network, Usb

from ..config import settings
from ..models import Transaction, TransactionStatus

STORE_NAME = "TOKO BU ISTI"

# The shop is on one Windows PC in Indonesia; the frontend gets local time for
# free because browser Date methods use the OS timezone, but this runs server-side
# in UTC (created_at is stored in UTC -- see the Firebird session_time_zone note in
# database.py), so the conversion has to happen explicitly here.
STORE_TIMEZONE = ZoneInfo("Asia/Jakarta")

# The TM-U220D is a 76/69.5/57.5mm dot-matrix printer, not an 80mm thermal one --
# there is no 80mm mode. At the shop's 76mm roll, Font A prints 35 columns per
# Epson's technical reference (DIP switch 2-1 table); the printer's own left/right
# margins (~6mm each) are fixed in hardware, so no software-side padding is needed.
LINE_WIDTH = 35


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
    printer.text(f"{left}{right.rjust(max(1, LINE_WIDTH - len(left)))}\n")


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

        created_at = txn.created_at.replace(tzinfo=timezone.utc).astimezone(STORE_TIMEZONE)
        printer.text(f"#{txn.sale_number}\n")
        printer.text(f"{created_at.strftime('%d-%m-%Y %H:%M')}  {txn.cashier_name}\n")
        printer.text("-" * LINE_WIDTH + "\n")

        printer.set(align="left")
        for item in txn.lines:
            printer.text(f"{item.name}\n")
            _line(printer, f"  {item.qty} x {item.price:,.0f}".replace(",", "."), f"{item.line_total:,.0f}".replace(",", "."))

        printer.text("-" * LINE_WIDTH + "\n")
        _line(printer, "Total", f"{txn.total:,.0f}".replace(",", "."))
        _line(printer, "Tunai", f"{txn.tendered:,.0f}".replace(",", "."))
        _line(printer, "Kembali", f"{txn.change:,.0f}".replace(",", "."))
        printer.text("\n")

        printer.set(align="center")
        # Rendered as an image via python-barcode rather than printer.barcode():
        # neither the hardware GS k command nor escpos's "graphics" (GS ( L)
        # software renderer is understood by escpresso -- the former echoed the
        # raw command back as literal text, the latter produced nothing. Only the
        # bitImageRaster (GS v 0) command is actually rendered, and printer.barcode()
        # has no way to reach that renderer while also suppressing the
        # human-readable digits under the bars, so the image is built directly.
        code128 = barcode_lib.get_barcode_class("code128")
        barcode_image = code128(str(txn.sale_number), writer=ImageWriter()).render(
            writer_options={"write_text": False, "module_height": 5, "quiet_zone": 0}
        )
        printer.image(barcode_image, impl="bitImageRaster", center=True)
        printer.text("\n")
    except (EscposError, OSError) as exc:
        raise PrinterError(str(exc)) from exc
