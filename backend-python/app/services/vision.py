"""Tree-trunk segmentation & DBH measurement (Phase 1, Step 3).

Hybrid pipeline (research-validated):

1. **YOLO path** — if custom trunk-seg weights exist at
   ``weights/trunk-seg.pt``, Ultralytics YOLOv11-seg produces the trunk
   mask directly (drop-in slot for a forestry-trained model).
2. **OpenCV depth-guided fallback** (Holcomb et al. 2023 style):
   depth-histogram mode in the central image third -> keep pixels within
   +/-10% depth -> connected components -> densest oblong cluster ->
   PCA orientation -> rotate upright -> two-pass vertical scanline
   boundary detection at the breast-height band -> chord width.
3. **Geometry** — pinhole conversion + circle-chord correction using AR
   depth and focal length (see ``app.core.geometry``).
"""

from dataclasses import dataclass

import cv2
import numpy as np

from app.config import get_settings
from app.core.geometry import chord_corrected_diameter_cm

MIN_COMPONENT_PX = 300
DEPTH_BUCKET_M = 0.03
DEPTH_WINDOW = 0.10
SCANLINE_HIGH = 0.6
SCANLINE_LOW = 0.5


@dataclass
class TrunkMeasurement:
    dbh_cm: float
    method: str  # yolo_opencv_hybrid | opencv_fallback
    confidence: float  # 0..1
    mask_width_px: float
    depth_m: float
    trunk_mask: np.ndarray | None = None


_yolo_model = None


def _get_yolo():
    global _yolo_model
    settings = get_settings()
    if not settings.yolo_enabled:
        return None
    if _yolo_model is not None:
        return _yolo_model
    import os

    path = settings.yolo_weights_path
    if os.path.isfile(path):
        from ultralytics import YOLO

        _yolo_model = YOLO(path)
        return _yolo_model
    return None


def segment_trunk_yolo(image_bgr: np.ndarray) -> np.ndarray | None:
    """Return a binary trunk mask from YOLOv11-seg, or None on failure."""
    model = _get_yolo()
    if model is None:
        return None
    try:
        results = model.predict(image_bgr, verbose=False, imgsz=640, conf=0.25)
    except Exception:
        return None
    if not results:
        return None
    r = results[0]
    if r.masks is None or len(r.masks.data) == 0:
        return None
    # Pick the largest mask (trunk dominates the frame in guided capture)
    areas = [int(m.sum()) for m in r.masks.data]
    best = int(np.argmax(areas))
    mask = r.masks.data[best].cpu().numpy().astype(np.uint8)
    if mask.shape[:2] != image_bgr.shape[:2]:
        mask = cv2.resize(mask, (image_bgr.shape[1], image_bgr.shape[0]))
    return (mask > 0).astype(np.uint8)


def _depth_guided_mask(image_bgr: np.ndarray, depth_map: np.ndarray) -> np.ndarray:
    """Depth-mode filtering in the central third of the image."""
    h, w = image_bgr.shape[:2]
    center = depth_map[:, w // 3 : 2 * w // 3]
    valid = center[np.isfinite(center) & (center > 0)]
    if valid.size == 0:
        return np.zeros((h, w), dtype=np.uint8)
    buckets = np.round(valid / DEPTH_BUCKET_M).astype(int)
    mode_bucket = np.bincount(buckets).argmax()
    trunk_depth = mode_bucket * DEPTH_BUCKET_M
    keep = (np.abs(depth_map - trunk_depth) <= DEPTH_WINDOW * trunk_depth) & (depth_map > 0)
    mask = keep.astype(np.uint8)
    # Clean up
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    return mask


def _color_guided_mask(image_bgr: np.ndarray) -> np.ndarray:
    """No depth map: trunk candidate from vertical edges + saturation.

    Works on the guided-capture assumption that the trunk is the dominant
    vertical structure in the central region of the frame.
    """
    h, w = image_bgr.shape[:2]
    blur = cv2.GaussianBlur(image_bgr, (5, 5), 0)
    gray = cv2.cvtColor(blur, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 40, 120)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 15))  # vertical emphasis
    vertical = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[:, w // 4 : 3 * w // 4] = vertical[:, w // 4 : 3 * w // 4]
    kernel2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel2, iterations=1)
    return mask


def _densest_component(mask: np.ndarray) -> tuple[int, np.ndarray]:
    """Select the trunk-like connected component.

    Score combines hull solidity (density) with vertical elongation, since a
    solid squat blob and a solid trunk both have density ~1.0 — the elongation
    term is what disambiguates them. Components are also restricted to the
    central region where the guided-capture UI forces the trunk to sit.
    """
    _h, w = mask.shape
    num, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    best_label, best_score = 0, 0.0
    for label in range(1, num):
        area = stats[label, cv2.CC_STAT_AREA]
        bw, bh = stats[label, cv2.CC_STAT_WIDTH], stats[label, cv2.CC_STAT_HEIGHT]
        if area < MIN_COMPONENT_PX or bh < 30:
            continue
        cx = stats[label, cv2.CC_STAT_LEFT] + bw / 2
        if not (w * 0.2 <= cx <= w * 0.8):
            continue
        component = (labels == label).astype(np.uint8)
        contours, _ = cv2.findContours(component, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        hull = cv2.convexHull(max(contours, key=cv2.contourArea))
        hull_area = cv2.contourArea(hull)
        if hull_area <= 0:
            continue
        density = area / hull_area
        elongation = bh / max(bw, 1)  # trunk is tall relative to its width
        score = density * (1.0 + min(elongation, 10.0) / 5.0)
        if score > best_score:
            best_score, best_label = score, label
    if best_label == 0:
        return 0, np.zeros_like(mask)
    return best_label, (labels == best_label).astype(np.uint8)


def _pca_angle(mask: np.ndarray) -> float:
    """Principal-axis orientation of the trunk mask (degrees from vertical)."""
    ys, xs = np.nonzero(mask)
    if xs.size < 10:
        return 0.0
    data = np.stack([xs, ys], axis=1).astype(np.float32)
    mean = data.mean(axis=0)
    cov = np.cov((data - mean).T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    major = eigvecs[:, np.argmax(eigvals)]
    angle = np.degrees(np.arctan2(abs(major[0]), abs(major[1])))
    return float(angle)


def _rotate_mask_upright(mask: np.ndarray, angle_deg: float) -> np.ndarray:
    if abs(angle_deg) < 0.5:
        return mask
    h, w = mask.shape
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle_deg, 1.0)
    return cv2.warpAffine(mask, matrix, (w, h), flags=cv2.INTER_NEAREST)


def _scanline_chord_px(mask: np.ndarray) -> float:
    """Two-pass vertical scanline at the mask's vertical midpoint."""
    ys, _ = np.nonzero(mask)
    if ys.size == 0:
        return 0.0
    y0 = int((ys.min() + ys.max()) / 2)
    row = mask[y0].astype(float)
    if row.sum() == 0:
        # Fall back to the densest row
        row_sums = mask.sum(axis=1)
        y0 = int(np.argmax(row_sums))
        row = mask[y0].astype(float)
    center = len(row) // 2
    if row[center] == 0:
        nonzero = np.nonzero(row)[0]
        if nonzero.size == 0:
            return 0.0
        center = int(nonzero[np.argmin(np.abs(nonzero - center))])
    # Walk outward: high threshold to enter the trunk, low to stay inside
    left = center
    while left > 0:
        window = row[max(0, left - 5) : left + 1]
        if window.size and (window.sum() / window.size) < SCANLINE_LOW:
            break
        left -= 1
    right = center
    while right < len(row) - 1:
        window = row[right : min(len(row), right + 6)]
        if window.size and (window.sum() / window.size) < SCANLINE_LOW:
            break
        right += 1
    return float(right - left)


def measure_dbh(
    image_bgr: np.ndarray,
    depth_m: float,
    focal_px: float,
    depth_map: np.ndarray | None = None,
) -> TrunkMeasurement:
    """Full hybrid pipeline: image + AR scalar depth -> DBH in cm."""
    if image_bgr is None or image_bgr.size == 0:
        raise ValueError("image_bgr is empty")
    if depth_m <= 0 or focal_px <= 0:
        raise ValueError("depth_m and focal_px must be positive")

    mask = segment_trunk_yolo(image_bgr)
    method = "yolo_opencv_hybrid"

    if mask is None or mask.sum() < MIN_COMPONENT_PX:
        method = "opencv_fallback"
        if depth_map is not None and depth_map.shape[:2] == image_bgr.shape[:2]:
            mask = _depth_guided_mask(image_bgr, depth_map)
        else:
            mask = _color_guided_mask(image_bgr)
        _, mask = _densest_component(mask)
        if mask.sum() < MIN_COMPONENT_PX:
            raise RuntimeError("Trunk segmentation failed: no viable component")

    # Orientation normalization, then breast-height band chord
    angle = _pca_angle(mask)
    upright = _rotate_mask_upright(mask, -angle)
    chord_px = _scanline_chord_px(upright)
    if chord_px <= 1:
        raise RuntimeError("Trunk segmentation failed: no scanline chord")

    dbh = chord_corrected_diameter_cm(0.0, depth_m, focal_px, mask_width_px=chord_px)

    # Confidence: solidity of the component + small-angle bonus + plausible DBH
    contours, _ = cv2.findContours(upright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    solidity = 0.0
    if contours:
        c = max(contours, key=cv2.contourArea)
        hull_area = cv2.contourArea(cv2.convexHull(c))
        if hull_area > 0:
            solidity = float(cv2.contourArea(c) / hull_area)
    angle_factor = max(0.0, 1.0 - abs(angle) / 30.0)
    size_factor = 1.0 if 2.0 <= dbh <= 300.0 else 0.3
    confidence = float(min(1.0, 0.45 * solidity + 0.3 * angle_factor + 0.25 * size_factor))

    return TrunkMeasurement(
        dbh_cm=round(dbh, 2),
        method=method,
        confidence=round(confidence, 3),
        mask_width_px=chord_px,
        depth_m=depth_m,
        trunk_mask=upright,
    )
