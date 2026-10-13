"""Synthetic-image tests for the trunk measurement pipeline.

Builds a controlled scene: a circular trunk projected through a pinhole
camera (tangent silhouette) on a dark background, with a matching synthetic
depth map, then checks that the OpenCV fallback recovers the true diameter.
"""

import cv2
import numpy as np
import pytest

from app.core.geometry import focal_px_from_hfov, silhouette_px_for_trunk
from app.services.vision import (
    TrunkMeasurement,
    _densest_component,
    _pca_angle,
    _rotate_mask_upright,
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

    expected_px = silhouette_px_for_trunk(trunk_width_cm, depth_m, focal_px)
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


def make_photo_scene(
    diameter_cm: float,
    depth_m: float,
    focal_px: float = 600.0,
    image_size: tuple[int, int] = (600, 800),
    background_texture: float = 0.5,
    furrow: float = 0.0,
    shift_px: int = 0,
    seed: int = 3,
) -> np.ndarray:
    """Smartphone-like scene without depth: textured forest + circular trunk."""
    h, w = image_size
    rng = np.random.default_rng(seed)
    blocks = rng.integers(0, 255, (h // 20, w // 20, 3)).astype(np.uint8)
    texture = cv2.resize(blocks, (w, h), interpolation=cv2.INTER_CUBIC).astype(float)
    image = 140.0 * (1 - background_texture) + texture * background_texture
    px = silhouette_px_for_trunk(diameter_cm, depth_m, focal_px)
    x0 = max(0, int(w / 2 + shift_px - px / 2))
    x1 = min(w, int(w / 2 + shift_px + px / 2))
    xs = np.arange(x0, x1)
    bark = np.array([70.0, 60.0, 50.0])[None, :] + furrow * np.sin(xs / 9.0)[:, None]
    image[:, x0:x1] = bark[None, :, :]
    image += rng.integers(-8, 9, image.shape)
    return np.clip(image, 0, 255).astype(np.uint8)


@pytest.mark.parametrize(
    ("diameter_cm", "depth_m", "kwargs"),
    [
        (55.0, 2.0, {}),
        (55.0, 2.0, {"furrow": 18.0}),
        (40.0, 2.5, {"shift_px": 120}),
        (150.0, 3.0, {}),
        (20.0, 1.5, {}),
    ],
)
def test_edge_profile_measures_without_depth_map(diameter_cm, depth_m, kwargs):
    image = make_photo_scene(diameter_cm, depth_m, **kwargs)
    result = measure_dbh(image, depth_m=depth_m, focal_px=600.0)
    assert result.method == "opencv_edge_profile"
    assert result.touches_frame is False
    assert abs(result.dbh_cm - diameter_cm) / diameter_cm < 0.04


def test_edge_profile_flags_trunk_too_close():
    image = make_photo_scene(200.0, 1.0)
    result = measure_dbh(image, depth_m=1.0, focal_px=600.0)
    assert result.touches_frame is True


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


@pytest.mark.parametrize("slope", [0.35, -0.35])
def test_tilted_trunk_is_straightened_both_ways(slope):
    # 120 px trunk leaning ~20 deg either way: the perpendicular width must be
    # read (~113 px), never the doubled-tilt width (~143 px).
    mask = np.zeros((600, 600), dtype=np.uint8)
    for y in range(40, 560):
        x = 300 + int((y - 300) * slope)
        mask[y, x - 60 : x + 60] = 1
    angle = _pca_angle(mask)
    assert (angle > 0) == (slope > 0)
    chord = _scanline_chord_px(_rotate_mask_upright(mask, -angle))
    assert 105 <= chord <= 118


def test_ai_mask_is_used_when_provided():
    image, _, expected_px = make_synthetic_scene(trunk_width_cm=42.0, depth_m=3.0)
    h, w = image.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    half = int(expected_px / 2)
    mask[:, w // 2 - half : w // 2 + half] = 1
    result = measure_dbh(image, depth_m=3.0, focal_px=1600.0, mask=mask)
    assert result.method == "sam2_opencv"
    assert 40.0 <= result.dbh_cm <= 44.0


def test_tiny_ai_mask_falls_back_to_classical():
    image, depth_map, _ = make_synthetic_scene(trunk_width_cm=42.0, depth_m=3.0)
    speck = np.zeros(image.shape[:2], dtype=np.uint8)
    speck[10:12, 10:12] = 1
    result = measure_dbh(image, depth_m=3.0, focal_px=1600.0, depth_map=depth_map, mask=speck)
    assert result.method == "opencv_depth"


def test_scanline_chord_width():
    mask = np.zeros((100, 200), dtype=np.uint8)
    mask[20:80, 70:130] = 1  # 60 px wide
    chord = _scanline_chord_px(mask)
    assert 55 <= chord <= 65


def test_measure_dbh_end_to_end():
    image, depth_map, _ = make_synthetic_scene(trunk_width_cm=42.0, depth_m=3.0, focal_px=1600.0)
    result = measure_dbh(image, depth_m=3.0, focal_px=1600.0, depth_map=depth_map)
    assert isinstance(result, TrunkMeasurement)
    assert result.method == "opencv_depth"
    # Tangent model recovers the true diameter within edge-jitter tolerance.
    assert 40.0 <= result.dbh_cm <= 44.0
    assert result.confidence > 0.3
    assert result.touches_frame is False


def test_measure_dbh_close_range_large_trunk_is_unbiased():
    # 80 cm trunk at 1.5 m: the old chord model read ~20 % low here.
    image, depth_map, _ = make_synthetic_scene(
        trunk_width_cm=80.0, depth_m=1.5, focal_px=500.0, image_size=(480, 640)
    )
    result = measure_dbh(image, depth_m=1.5, focal_px=500.0, depth_map=depth_map)
    assert 76.0 <= result.dbh_cm <= 84.0


def test_measure_dbh_flags_trunk_wider_than_frame():
    image, depth_map, _ = make_synthetic_scene(
        trunk_width_cm=120.0, depth_m=1.0, focal_px=1600.0, image_size=(480, 640)
    )
    result = measure_dbh(image, depth_m=1.0, focal_px=1600.0, depth_map=depth_map)
    assert result.touches_frame is True
    assert result.confidence <= 0.5


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
