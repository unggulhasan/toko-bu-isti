"""Daily itemized report PDF, built with reportlab's Platypus flowables.

Platypus (not the low-level canvas API) because a day's transaction count and
each transaction's line count both vary -- Platypus's flowables + SimpleDocTemplate
handle page breaks automatically, where canvas drawing would need hand-rolled
pagination math.
"""

from __future__ import annotations

import io
from datetime import date, datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..config import STORE_TIMEZONE
from ..models import Transaction, TransactionStatus

# Duplicated from services/printer.py deliberately: importing it from there would
# pull in printer.py's hardware-facing usb.core/escpos imports into a request path
# that has nothing to do with the physical printer.
STORE_NAME = "TOKO BU ISTI"


def _rupiah(value: int) -> str:
    return f"{value:,.0f}".replace(",", ".")


def _local(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc).astimezone(STORE_TIMEZONE)


def build_daily_report_pdf(
    transactions: list[Transaction], report_date: date, generated_at: datetime
) -> bytes:
    """Renders one PDF: a header, then every non-voided transaction as its own
    header line + line-item table, then a grand-total summary.

    Voided transactions are excluded from the listing and totals, mirroring the
    /transactions/summary endpoint's existing convention.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        title=f"Laporan Harian {report_date.isoformat()}",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ReportTitle", parent=styles["Title"], fontSize=16)
    meta_style = ParagraphStyle(
        "ReportMeta", parent=styles["Normal"], fontSize=9, textColor=colors.grey
    )
    txn_header_style = ParagraphStyle(
        "TxnHeader", parent=styles["Heading3"], fontSize=11, spaceBefore=10
    )

    generated_local = _local(generated_at)
    is_partial = report_date == generated_local.date()
    coverage = (
        f"Mencakup 00:00&ndash;{generated_local.strftime('%H:%M')} (hingga laporan dicetak)"
        if is_partial
        else "Mencakup satu hari penuh (00:00&ndash;24:00)"
    )

    story: list = [
        Paragraph(STORE_NAME, title_style),
        Paragraph(f"Laporan Harian &mdash; {report_date.strftime('%d-%m-%Y')}", styles["Heading2"]),
        Paragraph(coverage, meta_style),
        Paragraph(f"Dicetak: {generated_local.strftime('%d-%m-%Y %H:%M')}", meta_style),
        Spacer(1, 8 * mm),
    ]

    grand_total = 0
    grand_count = 0
    for txn in transactions:
        if txn.status == TransactionStatus.voided:
            continue
        grand_count += 1
        grand_total += txn.total

        created_local = _local(txn.created_at)
        header = (
            f"#{txn.sale_number} &nbsp;&nbsp; {created_local.strftime('%H:%M')} "
        )
        story.append(Paragraph(header, txn_header_style))

        rows = [["Barang", "Qty", "Harga", "Subtotal"]]
        for line in txn.lines:
            rows.append(
                [line.name, str(line.qty), _rupiah(line.price), _rupiah(line.line_total)]
            )
        rows.append(["", "", "Total", _rupiah(txn.total)])

        table = Table(rows, colWidths=[90 * mm, 15 * mm, 30 * mm, 30 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.grey),
                    ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.grey),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(table)

    story.append(Spacer(1, 8 * mm))
    if transactions and grand_count:
        summary_rows = [
            ["Jumlah transaksi", str(grand_count)],
            ["Total keseluruhan", _rupiah(grand_total)],
        ]
        summary_table = Table(summary_rows, colWidths=[50 * mm, 40 * mm])
        summary_table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 11),
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                    ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ]
            )
        )
        story.append(summary_table)
    else:
        story.append(Paragraph("Tidak ada transaksi pada tanggal ini.", styles["Normal"]))

    doc.build(story)
    return buffer.getvalue()
