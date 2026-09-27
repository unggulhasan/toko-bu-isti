"""ESC/POS printing: connect to the configured printer and render a receipt.

Dev targets escpresso (a TCP ESC/POS emulator on localhost:9100) via the Network
backend; production targets the real Epson TM-U220D over USB. Which one is used
is a .env setting (PRINTER_BACKEND), not a code change -- see config.py.
"""

from __future__ import annotations

from datetime import timezone

import barcode as barcode_lib
import usb.core
from barcode.writer import ImageWriter
from escpos.escpos import Escpos
from escpos.exceptions import Error as EscposError
from escpos.printer import Dummy, Network, Usb

from ..config import STORE_TIMEZONE, settings
from ..models import Transaction, TransactionStatus

STORE_NAME = "TOKO BU ISTI"
STORE_ADDRESS = "Pasar Jrakah"

# The TM-U220D is a 76/69.5/57.5mm dot-matrix printer, not an 80mm thermal one --
# there is no 80mm mode. At the shop's 76mm roll, Font A prints 35 columns per
# Epson's technical reference (DIP switch 2-1 table); the printer's own left/right
# margins (~6mm each) are fixed in hardware, so no software-side padding is needed.
LINE_WIDTH = 35


class PrinterError(Exception):
    """Raised when the printer is unreachable or rejects the job."""


# USB Printer Class, per the USB spec -- reported on an interface, not the device
# itself (composite USB printers report bDeviceClass 0 at the device level).
_USB_PRINTER_INTERFACE_CLASS = 7


def _is_usb_printer(device: usb.core.Device) -> bool:
    return any(
        interface.bInterfaceClass == _USB_PRINTER_INTERFACE_CLASS
        for cfg in device
        for interface in cfg
    )


def _autodetect_usb_printer() -> tuple[int, int]:
    """Find the (sole) USB Printer Class device. Raises PrinterError if none or more
    than one is found -- ambiguous cases need PRINTER_USB_VENDOR_ID/PRODUCT_ID set
    explicitly instead."""

    devices = list(usb.core.find(find_all=True, custom_match=_is_usb_printer))
    if not devices:
        raise PrinterError(
            "no USB printer detected -- check the cable, or set "
            "PRINTER_USB_VENDOR_ID / PRINTER_USB_PRODUCT_ID"
        )
    if len(devices) > 1:
        found = ", ".join(f"{d.idVendor:04x}:{d.idProduct:04x}" for d in devices)
        raise PrinterError(
            f"multiple USB printers detected ({found}) -- set "
            "PRINTER_USB_VENDOR_ID / PRINTER_USB_PRODUCT_ID to pick one"
        )
    return devices[0].idVendor, devices[0].idProduct


def get_printer() -> Escpos:
    backend = settings.printer_backend
    try:
        if backend == "network":
            return Network(settings.printer_host, port=settings.printer_port)
        if backend == "usb":
            if settings.printer_usb_vendor_id and settings.printer_usb_product_id:
                vendor_id = int(settings.printer_usb_vendor_id, 16)
                product_id = int(settings.printer_usb_product_id, 16)
            else:
                vendor_id, product_id = _autodetect_usb_printer()
            return Usb(vendor_id, product_id)
        if backend == "dummy":
            return Dummy()
    except (EscposError, OSError, ValueError) as exc:
        raise PrinterError(str(exc)) from exc
    raise PrinterError(f"unknown PRINTER_BACKEND: {backend!r}")


def _line(printer: Escpos, left: str, right: str, width: int = LINE_WIDTH) -> None:
    printer.text(f"{left}{right.rjust(max(1, width - len(left)))}\n")


def print_receipt(printer: Escpos, txn: Transaction) -> None:
    """Render one Transaction to the printer. Safe to call more than once for the
    same transaction -- a receipt is immutable once written, so a reprint is just
    the same render run again (spec: TransactionLine docstring)."""

    try:
        # custom_size=True is required or width/height are silently ignored.
        printer.set(align="center", bold=True, custom_size=True, width=2, height=2)
        printer.text(f"{STORE_NAME}\n")
        printer.text(f"{STORE_ADDRESS}\n")
        printer.set(align="center", bold=False, custom_size=True, width=1, height=1)
        if txn.status == TransactionStatus.voided:
            printer.set(align="center", bold=True)
            printer.text("** DIBATALKAN **\n")
            printer.set(align="center", bold=False)

        created_at = txn.created_at.replace(tzinfo=timezone.utc).astimezone(STORE_TIMEZONE)
        printer.text(f"#{txn.sale_number}\n")
        printer.text(f"{created_at.strftime('%d-%m-%Y %H:%M')}\n")
        printer.text("-" * LINE_WIDTH + "\n")

        printer.set(align="left")
        for item in txn.lines:
            printer.text(f"{item.name}\n")
            _line(printer, f"  {item.qty} x {item.price:,.0f}".replace(",", "."), f"{item.line_total:,.0f}".replace(",", "."))

        printer.text("-" * LINE_WIDTH + "\n")
        printer.set(align="left", bold=True, custom_size=True, width=2, height=2)
        # Double-width halves how many columns fit per physical line.
        _line(printer, "Total", f"{txn.total:,.0f}".replace(",", "."), width=LINE_WIDTH // 2)
        printer.set(align="left", bold=False, custom_size=True, width=1, height=1)
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
