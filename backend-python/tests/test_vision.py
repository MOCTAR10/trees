"""Synthetic-image tests for the trunk measurement pipeline.

Builds a controlled scene: bright vertical trunk rectangle on a dark
background, with a matching synthetic depth map, then checks that the
OpenCV fallback recovers a DBH close to the ground-truth width.
"""

import numpy as np
import pytest

from app.core.geometry import focal_px_from_hfov
from app.services.vision import (
    TrunkMeasurement,
    _densest_component,
    _pca_angle,
    _scanline_chord_px,
    measure_dbh,
)


def make_synthetic_scene(
    trunk_width_cm: float = 40.0,
    depth_m: float = 3.0,
    focal_px: float = 1600.0,
    image_size: tuple[int, int] = (480, 640),
    noise: int = 8,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray, float]:
    """Return (bgr_image, depth_map, expected_mask_width_px)."""
    h, w = image_size
    rng = np.random.default_rng(seed)
    image = np.full((h, w, 3), 20, dtype=np.uint8)

    expected_px = focal_px * trunk_width_cm / (100.0 * depth_m)
    half = int(expected_px / 2)
    cx = w // 2
    cv2_x0, cv2_x1 = cx - half, cx + half
    # Vertical trunk with slight taper and irregular bark edges
    for y in range(h):
        jitter = int(rng.integers(-2, 3))
        image[y, max(0, cv2_x0 + jitter) : min(w, cv2_x1 + jitter)] = (140, 135, 130)

    if noise:
        image = np.clip(
            image.astype(np.int16) + rng.integers(-noise, noise + 1, image.shape), 0, 255
        ).astype(np.uint8)

    depth_map = np.full((h, w), depth_m + 8.0, dtype=np.float32)  # background far away
    depth_map[:, max(0, cv2_x0) : min(w, cv2_x1)] = depth_m
    return image, depth_map, float(expected_px)


def test_focal_from_iphone_like_hfov():
    fx = focal_px_from_hfov(1920, 64.0)
    assert 1500 < fx < 1750


def test_densest_component_prefers_trunk():
    mask = np.zeros((240, 320), dtype=np.uint8)
    mask[40:200, 140:180] = 1  # trunk-like oblong
    mask[10:30, 10:60] = 1  # small noise blob
    mask[150:230, 200:310] = 1  # wide squat blob (lower density)
    label, component = _densest_component(mask)
    assert label > 0
    assert component[120, 160] == 1  # center of trunk
    assert component[20, 30] == 0  # noise excluded


def test_pca_detects_tilted_trunk():
    mask = np.zeros((300, 300), dtype=np.uint8)
    for y in range(50, 250):
        x = 150 + int((y - 150) * 0.2)  # ~11 deg tilt
        mask[y, x - 12 : x + 12] = 1
    angle = _pca_angle(mask)
    assert 5 < angle < 20


def test_scanline_chord_width():
    mask = np.zeros((100, 200), dtype=np.uint8)
    mask[20:80, 70:130] = 1  # 60 px wide
    chord = _scanline_chord_px(mask)
    assert 55 <= chord <= 65


def test_measure_dbh_end_to_end():
    image, depth_map, _ = make_synthetic_scene(trunk_width_cm=42.0, depth_m=3.0, focal_px=1600.0)
    result = measure_dbh(image, depth_m=3.0, focal_px=1600.0, depth_map=depth_map)
    assert isinstance(result, TrunkMeasurement)
    assert result.method == "opencv_fallback"  # no custom weights present
    # Chord correction adds a fraction of a percent; allow +-4 cm tolerance
    assert 38.0 <= result.dbh_cm <= 46.0
    assert result.confidence > 0.3


def test_measure_dbh_scales_with_distance():
    img1, d1, _ = make_synthetic_scene(trunk_width_cm=40.0, depth_m=2.0, seed=1)
    img2, d2, _ = make_synthetic_scene(trunk_width_cm=40.0, depth_m=4.0, seed=2)
    r1 = measure_dbh(img1, depth_m=2.0, focal_px=1600.0, depth_map=d1)
    r2 = measure_dbh(img2, depth_m=4.0, focal_px=1600.0, depth_map=d2)
    assert abs(r1.dbh_cm - r2.dbh_cm) < 4.0  # same physical trunk


def test_measure_dbh_rejects_bad_inputs():
    image, _, _ = make_synthetic_scene()
    with pytest.raises(ValueError):
        measure_dbh(image, depth_m=0, focal_px=1600)
    with pytest.raises(ValueError):
        measure_dbh(np.zeros((0, 0, 3), dtype=np.uint8), depth_m=3, focal_px=1600)
