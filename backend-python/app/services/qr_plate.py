"""Tree QR plate as a measuring ruler.

Every felled tree carries a QR plate whose printed symbol (the black square,
quiet zone excluded) has a standard side (``QR_TAG_SIZE_CM``, 8 cm by
default). When the plate is visible in the DBH photo, its side in pixels gives
the camera distance by the pinhole model ``z = f_px · side_cm / side_px`` —
a measured distance, unlike the AI estimate — and its content is the tree's
registry code, so the scan links itself to the tree.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

#: Distances (m) a plate reading must fall in to be trusted.
DISTANCE_M = (0.3, 10.0)

#: Smallest plate (px) whose corners are located precisely enough (~1 %).
MIN_SIDE_PX = 40.0

#: A plate seen very obliquely is foreshortened: its sides then disagree.
MAX_SIDE_SPREAD = 0.15


@dataclass
class PlateReading:
    code: str | None
    side_px: float
    center: tuple[float, float]
    spread: float


def _reading(code: str, corners: np.ndarray) -> PlateReading | None:
    sides = [float(np.linalg.norm(corners[i] - corners[(i + 1) % 4])) for i in range(4)]
    mean = sum(sides) / 4.0
    if mean <= 0:
        return None
    center = corners.mean(axis=0)
    return PlateReading(
        code=code,
        side_px=mean,
        center=(float(center[0]), float(center[1])),
        spread=(max(sides) - min(sides)) / mean,
    )


def detect(image_bgr: np.ndarray) -> PlateReading | None:
    """Locate a QR plate that **decodes** (bark texture yields false corners).

    Several symbols may be found; the largest decoded one wins. A half-size
    copy is tried when nothing decodes at full resolution.
    """
    detector = cv2.QRCodeDetector()
    for scale in (1.0, 0.5):
        img = image_bgr if scale == 1.0 else cv2.resize(image_bgr, None, fx=scale, fy=scale)
        try:
            ok, texts, points, _ = detector.detectAndDecodeMulti(img)
        except cv2.error:
            continue
        if not ok or points is None:
            continue
        best: PlateReading | None = None
        for text, quad in zip(texts, points, strict=False):
            code = (text or "").strip()
            if not code:
                continue
            reading = _reading(code, quad.reshape(-1, 2) / scale)
            if reading and (best is None or reading.side_px > best.side_px):
                best = reading
        if best is not None:
            return best
    return None


def distance_m(reading: PlateReading | None, focal_px: float, plate_cm: float) -> float | None:
    """Camera-to-plate distance (m), or ``None`` when the reading is unreliable."""
    if reading is None or focal_px <= 0 or plate_cm <= 0:
        return None
    if reading.side_px < MIN_SIDE_PX or reading.spread > MAX_SIDE_SPREAD:
        return None
    distance = focal_px * plate_cm / 100.0 / reading.side_px
    if not DISTANCE_M[0] <= distance <= DISTANCE_M[1]:
        return None
    return round(distance, 3)
