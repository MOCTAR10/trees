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

Tangent-silhouette model (used for DBH)
---------------------------------------
The two trunk edges seen by the camera are *tangent* lines to the circular
cross-section, not the ends of a flat chord. With ``z`` the distance from
the camera to the nearest bark surface and ``a`` the angular half-width of
the silhouette (``tan a = w_px / (2 f_x)``), the centre lies at
``L = z + r`` and ``r = L sin a``, hence:

    d = 2 r = 2 z sin a / (1 - sin a)

The pinhole/chord estimate is ~10 % low for a 50 cm trunk at 2 m and ~20 %
low for an 80 cm trunk at 1.5 m; the tangent model is exact for a circular
section.
"""

import math

#: Diagonal of a 36x24 mm full frame, the reference of 35 mm-equivalent focals.
FULL_FRAME_DIAGONAL_MM = math.hypot(36.0, 24.0)

#: Typical smartphone main camera (26 mm equivalent) when nothing better is known.
DEFAULT_FOCAL_35MM = 26.0


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


def tangent_diameter_cm(silhouette_px: float, depth_m: float, focal_px: float) -> float:
    """Exact diameter of a circular trunk from its silhouette width (cm)."""
    if silhouette_px <= 0 or depth_m <= 0 or focal_px <= 0:
        raise ValueError("silhouette_px, depth_m and focal_px must be positive")
    sin_a = math.sin(math.atan(silhouette_px / (2.0 * focal_px)))
    if sin_a >= 1.0:
        raise ValueError("degenerate silhouette")
    return 2.0 * depth_m * 100.0 * sin_a / (1.0 - sin_a)


def diameter_from_edges_cm(
    x_left_px: float, x_right_px: float, center_px: float, focal_px: float, depth_m: float
) -> float:
    """Exact diameter from the two trunk edges placed on the photo (cm).

    Works for an off-centre trunk: the half-angle is taken between the two
    edge rays (``atan((x - c) / f)``), then the tangent-silhouette model.
    """
    if not x_right_px > x_left_px or focal_px <= 0 or depth_m <= 0:
        raise ValueError("edges must be ordered, focal_px and depth_m positive")
    a_left = math.atan((x_left_px - center_px) / focal_px)
    a_right = math.atan((x_right_px - center_px) / focal_px)
    sin_a = math.sin((a_right - a_left) / 2.0)
    if sin_a >= 1.0:
        raise ValueError("degenerate silhouette")
    return 2.0 * depth_m * 100.0 * sin_a / (1.0 - sin_a)


def silhouette_px_for_trunk(diameter_cm: float, depth_m: float, focal_px: float) -> float:
    """Inverse of :func:`tangent_diameter_cm`: projected width of a trunk (px)."""
    r = diameter_cm / 200.0
    sin_a = r / (depth_m + r)
    return 2.0 * focal_px * math.tan(math.asin(sin_a))


def focal_px_from_35mm(focal_35mm: float, image_width_px: float, image_height_px: float) -> float:
    """Focal length in pixels from a 35 mm-equivalent focal (diagonal-based)."""
    if focal_35mm <= 0 or image_width_px <= 0 or image_height_px <= 0:
        raise ValueError("focal_35mm and image size must be positive")
    diagonal_px = math.hypot(image_width_px, image_height_px)
    return focal_35mm * diagonal_px / FULL_FRAME_DIAGONAL_MM


def focal_px_from_hfov(image_width_px: float, hfov_deg: float) -> float:
    """Focal length in pixels from horizontal field of view."""
    if image_width_px <= 0 or not (0 < hfov_deg < 180):
        raise ValueError("invalid image_width_px / hfov_deg")
    return image_width_px / (2.0 * math.tan(math.radians(hfov_deg) / 2.0))
