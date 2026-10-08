import math

from app.core.geometry import (
    chord_corrected_diameter_cm,
    focal_px_from_hfov,
    width_cm_from_mask,
)
from app.core.height_diameter import bole_height_m, estimate_height_m


def test_pinhole_width():
    # 100 px wide at 3 m with fx=1000 -> 100*3*100/1000 = 30 cm
    assert math.isclose(width_cm_from_mask(100, 3.0, 1000), 30.0)


def test_chord_correction_slightly_larger():
    raw = width_cm_from_mask(120, 4.0, 1100)
    corrected = chord_corrected_diameter_cm(raw, 4.0, 1100, mask_width_px=120)
    assert corrected > raw
    assert corrected / raw < 1.01  # small correction at 4 m


def test_chord_degenerate_guard():
    # chord >= 2p must not blow up
    assert chord_corrected_diameter_cm(900.0, 4.0, 1000) == 900.0


def test_focal_from_hfov():
    fx = focal_px_from_hfov(1920, 60.0)
    assert 1500 < fx < 1800  # ~1662 px for 60 deg HFOV


def test_height_curve_monotonic_and_capped():
    h10 = estimate_height_m(10, "Aucoumea klaineana")
    h50 = estimate_height_m(50, "Aucoumea klaineana")
    h200 = estimate_height_m(200, "Aucoumea klaineana")
    assert h10 < h50 < h200
    assert h200 <= 40.0  # species max height cap
    assert h10 > 1.3


def test_bole_height():
    assert bole_height_m(40) >= 5.0
    assert bole_height_m(40) < estimate_height_m(40)
