"""The single error shape: {"detail": {"code": ..., "message": ...}} (spec 1.5).

Messages are Indonesian where the frontend surfaces them to a cashier.
"""

from __future__ import annotations

from typing import Any, NoReturn

from fastapi import HTTPException


def api_error(status: int, code: str, message: str, **extra: Any) -> HTTPException:
    detail: dict[str, Any] = {"code": code, "message": message}
    detail.update(extra)
    return HTTPException(status_code=status, detail=detail)


def raise_api_error(status: int, code: str, message: str, **extra: Any) -> NoReturn:
    raise api_error(status, code, message, **extra)


def product_not_found(barcode_or_id: str) -> HTTPException:
    return api_error(
        404, "PRODUCT_NOT_FOUND", f'Barkode "{barcode_or_id}" tidak ditemukan'
    )


def barcode_taken(barcode: str) -> HTTPException:
    return api_error(409, "BARCODE_TAKEN", f'Barkode "{barcode}" sudah dipakai produk lain')


def unknown_cashier() -> HTTPException:
    return api_error(400, "UNKNOWN_CASHIER", "Kasir tidak dikenal")


def invalid_pin() -> HTTPException:
    return api_error(401, "INVALID_PIN", "PIN salah")


def empty_sale() -> HTTPException:
    return api_error(400, "EMPTY_SALE", "Keranjang kosong")


def insufficient_tender(total: int, tendered: int) -> HTTPException:
    # `total` travels in the detail so a stale client can correct itself (spec 3.4).
    return api_error(
        400,
        "INSUFFICIENT_TENDER",
        "Uang diterima kurang dari total",
        total=total,
        tendered=tendered,
    )


def open_sale_not_found() -> HTTPException:
    return api_error(404, "OPEN_SALE_NOT_FOUND", "Keranjang tidak ditemukan")


def line_not_found() -> HTTPException:
    return api_error(404, "SALE_LINE_NOT_FOUND", "Baris tidak ditemukan")


def transaction_not_found() -> HTTPException:
    return api_error(404, "TRANSACTION_NOT_FOUND", "Transaksi tidak ditemukan")


def already_voided() -> HTTPException:
    return api_error(409, "ALREADY_VOIDED", "Transaksi sudah dibatalkan")


def printer_unavailable() -> HTTPException:
    return api_error(503, "PRINTER_UNAVAILABLE", "Tidak dapat menghubungi printer")
