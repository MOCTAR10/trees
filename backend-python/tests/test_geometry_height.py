import math

import pytest

from app.core.geometry import (
    chord_corrected_diameter_cm,
    diameter_from_edges_cm,
    focal_px_from_35mm,
    focal_px_from_hfov,
    silhouette_px_for_trunk,
    tangent_diameter_cm,
    width_cm_from_mask,
)
from app.core.height_diameter import bole_height_m, estimate_height_m


@pytest.mark.parametrize(
    ("diameter_cm", "depth_m", "focal_px"),
    [(50.0, 2.0, 1600.0), (120.0, 1.5, 3000.0), (15.0, 4.0, 900.0), (250.0, 3.0, 2800.0)],
)
def test_tangent_model_round_trips(diameter_cm, depth_m, focal_px):
    px = silhouette_px_for_trunk(diameter_cm, depth_m, focal_px)
    assert math.isclose(tangent_diameter_cm(px, depth_m, focal_px), diameter_cm, rel_tol=1e-9)


def test_pinhole_underestimates_where_tangent_is_exact():
    # 50 cm trunk, bark 2 m away: the flat-chord reading is ~10 % low.
    px = silhouette_px_for_trunk(50.0, 2.0, 1600.0)
    chord = chord_corrected_diameter_cm(0.0, 2.0, 1600.0, mask_width_px=px)
    assert chord < 46.0
    assert math.isclose(tangent_diameter_cm(px, 2.0, 1600.0), 50.0, rel_tol=1e-9)


def test_tangent_rejects_bad_inputs():
    with pytest.raises(ValueError):
        tangent_diameter_cm(0, 2.0, 1600.0)


def test_focal_from_35mm_equivalent():
    # 26 mm-eq main camera, 4032x3024 sensor output -> ~3030 px
    fx = focal_px_from_35mm(26.0, 4032, 3024)
    assert 2950 < fx < 3100
    # Orientation-invariant (diagonal-based)
    assert math.isclose(fx, focal_px_from_35mm(26.0, 3024, 4032))


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


@pytest.mark.parametrize("offset_px", [0.0, 400.0, -650.0])
def test_edges_give_the_true_diameter_even_off_centre(offset_px):
    # 55 cm trunk at 2 m, f = 1600 px, centred then shifted sideways.
    f, z, d = 1600.0, 2.0, 55.0
    r = d / 200.0
    alpha = math.asin(r / (z + r))
    axis = math.atan(offset_px / f)
    left = f * math.tan(axis - alpha)
    right = f * math.tan(axis + alpha)
    assert math.isclose(diameter_from_edges_cm(left, right, 0.0, f, z), d, rel_tol=1e-9)


def test_edges_must_be_ordered():
    with pytest.raises(ValueError):
        diameter_from_edges_cm(100, 50, 0, 1600, 2)
