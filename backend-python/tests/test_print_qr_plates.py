"""Printable QR plates (Slice 16): exact size, decodable, sovereign output."""

import re

import numpy as np

from app.services import qr_plate
from tools import print_qr_plates


def test_svg_symbol_is_exactly_the_plate_size_and_decodes(tmp_path):
    svg = print_qr_plates.plate_svg("GA-2026-000123", 8.0)
    assert 'width="80.0mm"' in svg
    xs = [float(x) for x in re.findall(r'<rect x="([0-9.]+)"', svg)]
    widths = [float(w) for w in re.findall(r'width="([0-9.]+)" height', svg)]
    assert min(xs) == 0.0
    assert abs(max(xs) + widths[0] - 80.0) < 1e-3

    # Rasterise the modules at 10 px/mm and read it back like the scanner does.
    px = 10
    canvas = np.full((800 + 2 * 80, 800 + 2 * 80, 3), 255, np.uint8)
    for x, y in re.findall(r'<rect x="([0-9.]+)" y="([0-9.]+)"', svg):
        x0, y0 = round(float(x) * px) + 80, round(float(y) * px) + 80
        cell = round(widths[0] * px)
        canvas[y0 : y0 + cell, x0 : x0 + cell] = 0
    reading = qr_plate.detect(canvas)
    assert reading is not None and reading.code == "GA-2026-000123"
    assert abs(reading.side_px - 800) / 800 < 0.02


def test_batch_writes_pdf_and_one_svg_per_plate(tmp_path):
    codes = [f"GA-DEMO-{i:03d}" for i in range(1, 8)]
    summary = print_qr_plates.write_batch(codes, tmp_path, 8.0)
    assert summary == {"plates": 7, "pages": 2, "out": str(tmp_path)}  # 2 x 2 per A4 page
    pdf = (tmp_path / "plaques_qr.pdf").read_bytes()
    assert pdf.startswith(b"%PDF")
    assert sorted(p.name for p in (tmp_path / "svg").iterdir())[0] == "GA-DEMO-001.svg"


def test_pdf_drawing_spans_exactly_the_plate_size():
    from reportlab.lib.units import mm

    drawing = print_qr_plates._qr_drawing("GA-2026-000123", 80 * mm)
    x0, y0, x1, y1 = drawing.getBounds()
    assert abs((x1 - x0) - 80 * mm) < 0.01 and abs((y1 - y0) - 80 * mm) < 0.01
