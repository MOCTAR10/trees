"""Camera/depth geometry for DBH estimation from a segmentation mask.

Pinhole model
-------------
A point at real width ``w`` (cm) and depth ``z`` (m) projects to
``w_px = f_x * w / (100 * z)`` pixels, where ``f_x`` is the focal length
in pixels. Inverting:

    w_cm = mask_width_px * z_m * 100 / f_x

Circle-chord correction
-----------------------
The visible trunk section is the near arc of a circle. Measuring the chord
between the two mask edges underestimates the true diameter ``d`` because
the chord lies in front of the trunk axis. With perpendicular distance
``p`` from the camera to the chord plane and chord length ``l`` (both in
3D, meters):

    d = (l^2 + 4 p^2) / (2 * sqrt(4 p^2 - l^2 * 0)) ... simplified form used
    in the smartphone-LiDAR DBH literature (MDPI Sensors 2025):

    d = l * sqrt(1 + (l / (2p))^2) / sqrt(1 - (l / (2p))^2)   [exact]
    ≈ l * (1 + l^2 / (16 p^2))                                 [paraxial]

We implement the paraxial approximation with an exactness guard on l < 2p.
"""

import math


def width_cm_from_mask(
    mask_width_px: float,
    depth_m: float,
    focal_px: float,
) -> float:
    """Simple pinhole conversion (no chord correction)."""
    if mask_width_px <= 0 or depth_m <= 0 or focal_px <= 0:
        raise ValueError("mask_width_px, depth_m and focal_px must be positive")
    return mask_width_px * depth_m * 100.0 / focal_px


def chord_corrected_diameter_cm(
    chord_cm: float,
    depth_m: float,
    focal_px: float,
    mask_width_px: float | None = None,
) -> float:
    """Apply the circle-chord correction to a pinhole width estimate.

    ``chord_cm`` may either be an explicit 3D chord length, or derived from
    the mask when ``mask_width_px`` is provided (chord in the image plane at
    depth ``depth_m``).
    """
    if mask_width_px is not None:
        chord_cm = width_cm_from_mask(mask_width_px, depth_m, focal_px)
    if chord_cm <= 0:
        raise ValueError("chord_cm must be positive")
    p = depth_m * 100.0  # cm
    ratio = chord_cm / (2.0 * p)
    if ratio >= 1.0:
        # Degenerate geometry: fall back to raw chord (guards against noise).
        return chord_cm
    # Paraxial correction
    return chord_cm * (1.0 + chord_cm**2 / (16.0 * p**2))


def focal_px_from_hfov(image_width_px: float, hfov_deg: float) -> float:
    """Focal length in pixels from horizontal field of view."""
    if image_width_px <= 0 or not (0 < hfov_deg < 180):
        raise ValueError("invalid image_width_px / hfov_deg")
    return image_width_px / (2.0 * math.tan(math.radians(hfov_deg) / 2.0))
