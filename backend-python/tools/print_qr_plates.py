"""Génère les planches de plaques QR à imprimer ou graver, sur place.

Chaque plaque porte le code registre de l'arbre (ex. ``GA-2026-000123``) en QR
**vectoriel** dont le carré imprimé mesure exactement ``QR_TAG_SIZE_CM``
(8 cm par défaut) — la taille que le scanner utilise comme règle — avec le
code en clair et la mention « République Gabonaise — MEF ». Deux sorties :

- **PDF A4** (imprimante thermique à transfert / laser bureautique, à 100 %) ;
- **SVG** une plaque par fichier (logiciels de gravure laser : LightBurn,
  EzCad… — import vectoriel à l'échelle 1:1).

Aucune donnée ne quitte le serveur : souveraineté de la production des
plaques.

Usage (depuis le conteneur API) ::

    python -m tools.print_qr_plates --codes GA-2026-000123 GA-2026-000124 --out /media/scans/plaques
    python -m tools.print_qr_plates --registry-prefix GA-DEMO- --out /media/scans/plaques
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.config import get_settings

ISSUER = "République Gabonaise — MEF"
MARGIN_MM = 12
GAP_MM = 8
TEXT_MM = 12


def _qr_drawing(code: str, side_pt: float) -> Drawing:
    """QR whose *symbol* (quiet zone excluded) spans exactly ``side_pt``."""
    widget = QrCodeWidget(code, barLevel="M", barBorder=0)
    x0, y0, x1, y1 = widget.getBounds()
    width, height = x1 - x0, y1 - y0
    drawing = Drawing(side_pt, side_pt, transform=[side_pt / width, 0, 0, side_pt / height, 0, 0])
    drawing.add(widget)
    return drawing


def plates_pdf(codes: list[str], out: Path, side_cm: float) -> int:
    """A4 sheets of plates; returns the number of pages."""
    side = side_cm * 10 * mm
    cell_w, cell_h = side + GAP_MM * mm, side + (TEXT_MM + GAP_MM) * mm
    page_w, page_h = A4
    cols = max(1, int((page_w - 2 * MARGIN_MM * mm + GAP_MM * mm) // cell_w))
    rows = max(1, int((page_h - 2 * MARGIN_MM * mm + GAP_MM * mm) // cell_h))
    per_page = cols * rows
    pdf = canvas.Canvas(str(out), pagesize=A4)
    pdf.setTitle("Plaques QR — registre des arbres")
    pages = 0
    for start in range(0, len(codes), per_page):
        pages += 1
        for i, code in enumerate(codes[start : start + per_page]):
            col, row = i % cols, i // cols
            x = MARGIN_MM * mm + col * cell_w
            y = page_h - MARGIN_MM * mm - (row + 1) * cell_h + TEXT_MM * mm
            renderPDF.draw(_qr_drawing(code, side), pdf, x, y)
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


def write_batch(codes: list[str], out_dir: Path, side_cm: float) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    pages = plates_pdf(codes, out_dir / "plaques_qr.pdf", side_cm)
    svg_dir = out_dir / "svg"
    svg_dir.mkdir(exist_ok=True)
    for code in codes:
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in code)
        (svg_dir / f"{safe}.svg").write_text(plate_svg(code, side_cm), encoding="utf-8")
    return {"plates": len(codes), "pages": pages, "out": str(out_dir)}


async def _registry_codes(prefix: str) -> list[str]:
    from app.services import db

    try:
        rows = await db.fetch_all(
            "SELECT tree_code FROM tree_registry WHERE tree_code LIKE $1 ORDER BY tree_code",
            f"{prefix}%",
        )
    finally:
        await db.close_pool()
    return [r["tree_code"] for r in rows]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--codes", nargs="+", help="codes registre à imprimer")
    group.add_argument(
        "--registry-prefix", help="tous les arbres du registre dont le code commence par…"
    )
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--size-cm", type=float, default=None, help="taille du carré QR (défaut : QR_TAG_SIZE_CM)"
    )
    args = parser.parse_args()
    codes = args.codes or asyncio.run(_registry_codes(args.registry_prefix))
    if not codes:
        raise SystemExit("Aucun code à imprimer.")
    side = args.size_cm or get_settings().qr_tag_size_cm
    summary = write_batch(codes, args.out, side)
    print(
        f"{summary['plates']} plaques ({side:g} cm), {summary['pages']} page(s) PDF + SVG -> {summary['out']}"
    )


if __name__ == "__main__":
    main()
