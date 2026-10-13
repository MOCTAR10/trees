"""Tree-trunk segmentation & DBH measurement (Phase 1, Step 3).

Hybrid pipeline:

1. **AI mask** — when the caller provides one (SAM 2.1 cut-out, see
   ``app.services.ai_models``), it is used directly.
2. **OpenCV depth-guided** (Holcomb et al. 2023 style) when a depth map is
   available: depth-histogram mode in the central image third -> keep pixels
   within +/-10% depth -> connected components -> densest oblong cluster.
3. **Edge profile** (the usual smartphone case, no depth map): trunk edges
   from vertical-edge persistence across the breast-height band; the legacy
   colour mask is the last resort.

Then: orientation normalisation -> two-pass scanline at breast height ->
exact tangent-silhouette geometry with the bark distance and the focal length
in pixels (see ``app.core.geometry``).
"""

from dataclasses import dataclass

import cv2
import numpy as np

from app.core.geometry import tangent_diameter_cm

MIN_COMPONENT_PX = 300
DEPTH_BUCKET_M = 0.03
DEPTH_WINDOW = 0.10
SCANLINE_HIGH = 0.6
SCANLINE_LOW = 0.5
FRAME_MARGIN_PX = 2
EDGE_SMOOTH_PX = 5
EDGE_SNR = 6.0
EDGE_MIN_GRADIENT = 2.0
EDGE_CANDIDATES = 25
EDGE_MIN_WIDTH_PX = 8

#: Guided capture keeps the trunk near vertical: a larger PCA angle means the
#: mask is not trunk-shaped (wide close-up, canopy) and is not trusted.
MAX_TILT_DEG = 30.0

#: Silhouette wider than this share of the frame: geometry is ill-conditioned
#: (a 1 % edge error becomes a >5 % DBH error) — treat as "step back".
MAX_FRAME_FILL = 0.8

#: DBH range (cm) a vision measurement must fall in to be trusted. Below 5 cm
#: is a sapling (or a segmentation artefact); Gabonese giants stay < 400 cm.
PLAUSIBLE_DBH_CM = (5.0, 400.0)


@dataclass
class TrunkMeasurement:
    dbh_cm: float
    method: str  # sam2_opencv | opencv_depth | opencv_edge_profile | opencv_fallback
    confidence: float  # 0..1
    mask_width_px: float
    depth_m: float
    trunk_mask: np.ndarray | None = None
    touches_frame: bool = False


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


def _edge_profile_mask(image_bgr: np.ndarray) -> np.ndarray:
    """No depth map: trunk edges from vertical-edge persistence.

    The signed horizontal gradient is averaged over the breast-height band:
    a trunk edge keeps the same sign row after row (background -> bark on one
    side, bark -> background on the other), while bark and foliage texture
    averages out. The two strongest opposite-sign peaks around the image
    centre (where the capture guide places the trunk) bound the trunk. A side
    without a credible edge means the trunk runs past the frame there.
    """
    h, w = image_bgr.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    gray = cv2.cvtColor(cv2.GaussianBlur(image_bgr, (5, 5), 0), cv2.COLOR_BGR2GRAY)
    band = gray[int(h * 0.35) : int(h * 0.65)].astype(np.float32)
    if band.size == 0 or w < 8:
        return mask
    profile = cv2.Sobel(band, cv2.CV_32F, 1, 0, ksize=3).mean(axis=0)
    profile = np.convolve(profile, np.ones(EDGE_SMOOTH_PX) / EDGE_SMOOTH_PX, mode="same")
    profile[:EDGE_SMOOTH_PX] = 0.0
    profile[-EDGE_SMOOTH_PX:] = 0.0
    strength = np.abs(profile)
    threshold = max(float(np.median(strength)) * EDGE_SNR, EDGE_MIN_GRADIENT)
    candidates = sorted(
        int(i) for i in np.argsort(-strength)[: EDGE_CANDIDATES * 2] if strength[i] >= threshold
    )
    if not candidates:
        return mask

    center = w / 2.0
    best: tuple[float, int, int] | None = None
    for a, li in enumerate(candidates):
        for ri in candidates[a + 1 :]:
            if ri - li < EDGE_MIN_WIDTH_PX or profile[li] * profile[ri] >= 0:
                continue
            off_center = abs((li + ri) / 2.0 - center) / center
            score = float(strength[li] + strength[ri]) * (1.0 - 0.5 * off_center)
            if best is None or score > best[0]:
                best = (score, li, ri)
    if best is not None:
        left, right = best[1], best[2]
    else:
        # A single credible edge: the trunk runs past the frame on its far side.
        edge = max(candidates, key=lambda i: strength[i])
        left, right = (edge, w - 1) if edge < center else (0, edge)
    mask[:, left : right + 1] = 1
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
    """Signed principal-axis tilt of the trunk mask (degrees from vertical).

    Positive when the trunk leans right going down the image (x grows with y).
    """
    ys, xs = np.nonzero(mask)
    if xs.size < 10:
        return 0.0
    data = np.stack([xs, ys], axis=1).astype(np.float32)
    mean = data.mean(axis=0)
    cov = np.cov((data - mean).T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    major = eigvecs[:, np.argmax(eigvals)]
    if major[1] < 0:
        major = -major
    angle = np.degrees(np.arctan2(major[0], major[1]))
    return float(angle)


def _rotate_mask_upright(mask: np.ndarray, angle_deg: float) -> np.ndarray:
    if abs(angle_deg) < 0.5:
        return mask
    h, w = mask.shape
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle_deg, 1.0)
    return cv2.warpAffine(mask, matrix, (w, h), flags=cv2.INTER_NEAREST)


def _touches_side_borders(mask: np.ndarray) -> bool:
    """True when the trunk reaches a side edge in the breast-height band."""
    h, _w = mask.shape
    band = mask[int(h * 0.35) : int(h * 0.65)]
    if band.size == 0:
        return False
    margin = FRAME_MARGIN_PX + 1
    return bool(band[:, :margin].any() or band[:, -margin:].any())


def _scanline_chord_px(mask: np.ndarray) -> float:
    """Two-pass vertical scanline at the mask's vertical midpoint."""
    left, right = _scanline_bounds(mask)
    return float(right - left)


def _scanline_bounds(mask: np.ndarray) -> tuple[int, int]:
    """Left/right trunk edges (px) on the breast-height scanline."""
    ys, _ = np.nonzero(mask)
    if ys.size == 0:
        return 0, 0
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
            return 0, 0
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
    return left, right


def measure_dbh(
    image_bgr: np.ndarray,
    depth_m: float,
    focal_px: float,
    depth_map: np.ndarray | None = None,
    mask: np.ndarray | None = None,
) -> TrunkMeasurement:
    """Full hybrid pipeline: image + bark distance -> DBH in cm.

    ``mask`` is an optional trunk cut-out from an AI segmenter (SAM 2.1); the
    classical masks are used when it is absent or too small.
    """
    if image_bgr is None or image_bgr.size == 0:
        raise ValueError("image_bgr is empty")
    if depth_m <= 0 or focal_px <= 0:
        raise ValueError("depth_m and focal_px must be positive")

    method = "sam2_opencv"
    if mask is not None:
        mask = (mask > 0).astype(np.uint8)
        _, mask = _densest_component(mask)
    if mask is None or mask.sum() < MIN_COMPONENT_PX:
        method = "opencv_fallback"
        if depth_map is not None and depth_map.shape[:2] == image_bgr.shape[:2]:
            mask = _depth_guided_mask(image_bgr, depth_map)
            _, mask = _densest_component(mask)
            method = "opencv_depth"
        else:
            mask = _edge_profile_mask(image_bgr)
            method = "opencv_edge_profile"
            if mask.sum() < MIN_COMPONENT_PX:
                _, mask = _densest_component(_color_guided_mask(image_bgr))
                method = "opencv_fallback"
        if mask.sum() < MIN_COMPONENT_PX:
            raise RuntimeError("Trunk segmentation failed: no viable component")

    # A trunk clipped by the frame edges has no measurable silhouette; check
    # before rotation, which would move the clipped edges off the border.
    clipped = _touches_side_borders(mask)

    # Orientation normalization, then breast-height band chord. The edge
    # profile already assumes an upright trunk (and a wide-trunk mask would
    # fool PCA into a 90 degree turn).
    angle = 0.0 if method == "opencv_edge_profile" else _pca_angle(mask)
    if abs(angle) > MAX_TILT_DEG:
        angle = 0.0
    upright = _rotate_mask_upright(mask, -angle)
    left, right = _scanline_bounds(upright)
    chord_px = float(right - left)
    if chord_px <= 1:
        raise RuntimeError("Trunk segmentation failed: no scanline chord")
    width = upright.shape[1]
    touches_frame = (
        clipped
        or left <= FRAME_MARGIN_PX
        or right >= width - 1 - FRAME_MARGIN_PX
        or chord_px > MAX_FRAME_FILL * width
    )

    dbh = tangent_diameter_cm(chord_px, depth_m, focal_px)

    # Confidence: solidity of the component + small-angle bonus + plausible DBH
    contours, _ = cv2.findContours(upright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    solidity = 0.0
    if contours:
        c = max(contours, key=cv2.contourArea)
        hull_area = cv2.contourArea(cv2.convexHull(c))
        if hull_area > 0:
            solidity = float(cv2.contourArea(c) / hull_area)
    angle_factor = max(0.0, 1.0 - abs(angle) / 30.0)
    size_factor = 1.0 if PLAUSIBLE_DBH_CM[0] <= dbh <= PLAUSIBLE_DBH_CM[1] else 0.3
    confidence = float(min(1.0, 0.45 * solidity + 0.3 * angle_factor + 0.25 * size_factor))
    if touches_frame:
        confidence *= 0.5

    return TrunkMeasurement(
        dbh_cm=round(dbh, 2),
        method=method,
        confidence=round(confidence, 3),
        mask_width_px=chord_px,
        depth_m=depth_m,
        trunk_mask=upright,
        touches_frame=touches_frame,
    )
