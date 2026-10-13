"""Open AI models for the tree scanner (server-side, CPU).

- **SAM 2.1 tiny** (Meta, Apache-2.0) cuts the trunk out of the DBH photo
  from point prompts placed on the capture guide (image centre line).
- **Depth Anything V2 metric, outdoor small** returns a metric depth map
  (metres); its reading on the trunk at breast height gives the bark
  distance when the operator did not type one.

Both load lazily, once, behind ``ai_models_enabled``; every call returns
``None`` on any failure so the classical pipeline keeps working. Inference is
synchronous and serialized by a lock: callers run it in a worker thread.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

import cv2
import numpy as np

from app.config import get_settings

logger = logging.getLogger(__name__)

#: Longest image side fed to the models (SAM resizes to 1024 anyway).
MAX_SIDE = 1024

#: Prompt points along the capture guide, as (x, y) fractions of the frame.
TRUNK_PROMPTS = ((0.5, 0.42), (0.5, 0.5), (0.5, 0.58))

#: Breast-height band (row fractions) and plausible bark distance (m).
BAND = (0.4, 0.6)
DISTANCE_M = (0.5, 20.0)

#: The trunk's nearest surface is what the tangent model needs: a low
#: percentile of the trunk's depths approximates it.
NEAR_SURFACE_PERCENTILE = 20

_lock = threading.Lock()
_sam: tuple | None = None
_depth: tuple | None = None
_memory_ok: bool | None = None


def _available_memory_mb() -> float | None:
    """Memory the process may use: the cgroup limit, else the machine's RAM."""
    try:
        raw = Path("/sys/fs/cgroup/memory.max").read_text(encoding="ascii").strip()
        if raw != "max":
            return int(raw) / 2**20
    except OSError:
        pass
    try:
        for line in Path("/proc/meminfo").read_text(encoding="ascii").splitlines():
            if line.startswith("MemTotal:"):
                return int(line.split()[1]) / 1024
    except OSError:
        pass
    return None


def _memory_allows_models() -> bool:
    """Refuse to load the models where they would get the API OOM-killed."""
    global _memory_ok
    if _memory_ok is None:
        available = _available_memory_mb()
        needed = get_settings().ai_min_memory_mb
        _memory_ok = available is None or available >= needed
        if not _memory_ok:
            logger.warning(
                "Scanner AI disabled: %.0f MB available, %d MB required "
                "(raise the Docker/host memory or AI_MIN_MEMORY_MB)",
                available,
                needed,
            )
    return _memory_ok


def enabled() -> bool:
    return get_settings().ai_models_enabled and _memory_allows_models()


def _load_sam() -> tuple:
    global _sam
    if _sam is None:
        from transformers import Sam2Model, Sam2Processor

        model_id = get_settings().sam_model_id
        _sam = (Sam2Processor.from_pretrained(model_id), Sam2Model.from_pretrained(model_id).eval())
    return _sam


def _load_depth() -> tuple:
    global _depth
    if _depth is None:
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation

        model_id = get_settings().depth_model_id
        _depth = (
            AutoImageProcessor.from_pretrained(model_id),
            AutoModelForDepthEstimation.from_pretrained(model_id).eval(),
        )
    return _depth


def _downscale(image_bgr: np.ndarray) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    scale = MAX_SIDE / max(h, w)
    if scale >= 1.0:
        return image_bgr
    return cv2.resize(image_bgr, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)


def _rgb(image_bgr: np.ndarray):
    from PIL import Image

    return Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))


def segment_trunk(image_bgr: np.ndarray) -> np.ndarray | None:
    """Binary trunk mask (full image size) from SAM 2.1, or ``None``."""
    if not enabled():
        return None
    try:
        import torch

        small = _downscale(image_bgr)
        h, w = small.shape[:2]
        points = [[[[round(fx * w), round(fy * h)] for fx, fy in TRUNK_PROMPTS]]]
        labels = [[[1] * len(TRUNK_PROMPTS)]]
        with _lock:
            processor, model = _load_sam()
            inputs = processor(
                images=_rgb(small), input_points=points, input_labels=labels, return_tensors="pt"
            )
            with torch.inference_mode():
                out = model(**inputs, multimask_output=True)
            masks = processor.post_process_masks(out.pred_masks, inputs["original_sizes"])[0][0]
            scores = out.iou_scores[0, 0]
        best = _pick_trunk_mask(masks.numpy().astype(np.uint8), scores.numpy())
        if best is None:
            return None
        full_h, full_w = image_bgr.shape[:2]
        return cv2.resize(best, (full_w, full_h), interpolation=cv2.INTER_NEAREST)
    except Exception as exc:  # model download / runtime failure -> classical fallback
        logger.warning("SAM trunk segmentation skipped: %s", exc)
        return None


def _pick_trunk_mask(masks: np.ndarray, scores: np.ndarray) -> np.ndarray | None:
    """Best-scored candidate that looks like a trunk, not the whole frame."""
    best, best_score = None, -1.0
    for mask, score in zip(masks, scores, strict=True):
        h = mask.shape[0]
        band = mask[int(h * BAND[0]) : int(h * BAND[1])]
        if band.sum() == 0:
            continue
        width_share = float(band.any(axis=0).mean())
        if width_share > 0.97:  # background swallowed: not a trunk
            continue
        if float(score) > best_score:
            best, best_score = mask, float(score)
    return best


def depth_map(image_bgr: np.ndarray) -> np.ndarray | None:
    """Metric depth (m) at full image size, or ``None``."""
    if not enabled():
        return None
    try:
        import torch

        small = _downscale(image_bgr)
        with _lock:
            processor, model = _load_depth()
            inputs = processor(images=_rgb(small), return_tensors="pt")
            with torch.inference_mode():
                predicted = model(**inputs).predicted_depth[0].numpy()
        full_h, full_w = image_bgr.shape[:2]
        return cv2.resize(predicted.astype(np.float32), (full_w, full_h))
    except Exception as exc:
        logger.warning("AI depth estimation skipped: %s", exc)
        return None


def trunk_distance_m(depth: np.ndarray | None, mask: np.ndarray | None) -> float | None:
    """Bark distance at breast height from a depth map (and trunk mask)."""
    if depth is None:
        return None
    h, w = depth.shape[:2]
    rows = slice(int(h * BAND[0]), int(h * BAND[1]))
    region = depth[rows]
    if mask is not None and mask[rows].any():
        values = region[mask[rows] > 0]
    else:
        values = region[:, int(w * 0.45) : int(w * 0.55)].ravel()
    values = values[np.isfinite(values) & (values > 0)]
    if values.size == 0:
        return None
    distance = float(np.percentile(values, NEAR_SURFACE_PERCENTILE))
    if not DISTANCE_M[0] <= distance <= DISTANCE_M[1]:
        return None
    return round(distance, 2)


def warmup() -> None:
    """Load both models and run one tiny inference (startup, background)."""
    if not enabled():
        return
    frame = np.full((256, 256, 3), 110, dtype=np.uint8)
    segment_trunk(frame)
    depth_map(frame)
    logger.info("Scanner AI models ready")


def capabilities() -> dict:
    """What the scanner AI can do now, and why not when it is off."""
    configured = get_settings().ai_models_enabled
    on = enabled()
    reason = None
    if not configured:
        reason = "disabled"
    elif not on:
        reason = "memory"
    return {
        "ai_segmentation": on,
        "ai_distance": on,
        "ai_configured": configured,
        "ai_off_reason": reason,
    }
