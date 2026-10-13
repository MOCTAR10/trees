"""Printable tree QR plates (PDF sheets, SVG for laser engraving).

The printed QR symbol (quiet zone excluded) spans exactly the official plate
size (``QR_TAG_SIZE_CM``), so the scanner can use a plate as a ruler. Plates
are rendered on the server only: no code is sent to a third party.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import BinaryIO

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

ISSUER = "République Gabonaise — MEF"
MARGIN_MM = 12
GAP_MM = 8
TEXT_MM = 12


def qr_drawing(code: str, side_pt: float) -> Drawing:
    """QR whose *symbol* (quiet zone excluded) spans exactly ``side_pt``."""
    widget = QrCodeWidget(code, barLevel="M", barBorder=0)
    x0, y0, x1, y1 = widget.getBounds()
    width, height = x1 - x0, y1 - y0
    drawing = Drawing(side_pt, side_pt, transform=[side_pt / width, 0, 0, side_pt / height, 0, 0])
    drawing.add(widget)
    return drawing


def plates_pdf(codes: list[str], out: Path | BinaryIO, side_cm: float) -> int:
    """A4 sheets of plates; returns the number of pages."""
    side = side_cm * 10 * mm
    cell_w, cell_h = side + GAP_MM * mm, side + (TEXT_MM + GAP_MM) * mm
    page_w, page_h = A4
    cols = max(1, int((page_w - 2 * MARGIN_MM * mm + GAP_MM * mm) // cell_w))
    rows = max(1, int((page_h - 2 * MARGIN_MM * mm + GAP_MM * mm) // cell_h))
    per_page = cols * rows
    pdf = canvas.Canvas(str(out) if isinstance(out, Path) else out, pagesize=A4)
    pdf.setTitle("Plaques QR — registre des arbres")
    pages = 0
    for start in range(0, len(codes), per_page):
        pages += 1
        for i, code in enumerate(codes[start : start + per_page]):
            col, row = i % cols, i // cols
            x = MARGIN_MM * mm + col * cell_w
            y = page_h - MARGIN_MM * mm - (row + 1) * cell_h + TEXT_MM * mm
            renderPDF.draw(qr_drawing(code, side), pdf, x, y)
            pdf.setFont("Helvetica-Bold", 11)
            pdf.drawCentredString(x + side / 2, y - 5 * mm, code)
            pdf.setFont("Helvetica", 7)
            pdf.drawCentredString(x + side / 2, y - 9 * mm, ISSUER)
        pdf.setFont("Helvetica", 7)
        pdf.drawString(
            MARGIN_MM * mm,
            6 * mm,
            f"Imprimer à 100 % (sans mise à l'échelle) : le carré QR doit mesurer {side_cm:g} cm.",
        )
        pdf.showPage()
    pdf.save()
    return pages


def plate_svg(code: str, side_cm: float) -> str:
    """One plate as SVG in millimetres (1:1 for laser engraving)."""
    widget = QrCodeWidget(code, barLevel="M", barBorder=0)
    widget.qr.make()
    modules = widget.qr.getModuleCount()
    side_mm = side_cm * 10
    cell = side_mm / modules
    rects = []
    for r in range(modules):
        for c in range(modules):
            if widget.qr.isDark(r, c):
                rects.append(
                    f'<rect x="{c * cell:.4f}" y="{r * cell:.4f}" '
                    f'width="{cell:.4f}" height="{cell:.4f}"/>'
                )
    height = side_mm + TEXT_MM
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{side_mm}mm" height="{height}mm" '
        f'viewBox="0 0 {side_mm} {height}">'
        f'<g fill="#000">{"".join(rects)}</g>'
        f'<text x="{side_mm / 2}" y="{side_mm + 6}" font-family="Helvetica" font-size="5" '
        f'font-weight="bold" text-anchor="middle">{code}</text>'
        f'<text x="{side_mm / 2}" y="{side_mm + 10}" font-family="Helvetica" font-size="3" '
        f'text-anchor="middle">{ISSUER}</text></svg>'
    )


def plates_pdf_bytes(codes: list[str], side_cm: float) -> bytes:
    buf = io.BytesIO()
    plates_pdf(codes, buf, side_cm)
    return buf.getvalue()
