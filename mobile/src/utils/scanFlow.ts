import { Organ } from "../api/client";
import { fr } from "../i18n/fr";
import { DEFAULT_FOCAL_35MM, focalPx } from "./dbh";

const t = fr.capture;

export type Frame = "tall" | "square" | "dbh";

export interface ScanStep {
  key: string;
  organ: Organ;
  azimuth?: number;
  /** Short label for the step rail. */
  short: string;
  title: string;
  hint: string;
  frame: Frame;
}

/** The guided path: three identification photos then the diameter. */
export const CORE_STEPS: ScanStep[] = [
  { key: "whole", organ: "whole", azimuth: 0, short: t.railWhole, title: t.wholeTitle, hint: t.wholeHint, frame: "tall" },
  { key: "bark", organ: "bark", short: t.railBark, title: t.barkTitle, hint: t.trunkHint, frame: "square" },
  { key: "leaf", organ: "leaf", short: t.railLeaf, title: t.leafTitle, hint: t.leafHint, frame: "square" },
  { key: "dbh", organ: "dbh", short: t.railDbh, title: t.dbhTitle, hint: t.dbhHint, frame: "dbh" },
];

/** Optional views that sharpen the species identification. */
export const EXTRA_STEPS: ScanStep[] = [
  { key: "flower", organ: "flower", short: t.extraFlower, title: t.flower, hint: t.flowerHint, frame: "square" },
  { key: "fruit", organ: "fruit", short: t.extraFruit, title: t.fruit, hint: t.fruitHint, frame: "square" },
  { key: "leaf-under", organ: "leaf", short: t.extraLeafUnder, title: t.leafUnder, hint: t.leafHint, frame: "square" },
  { key: "bark-2", organ: "bark", short: t.extraBark2, title: t.barkAngle2, hint: t.trunkHint, frame: "square" },
  { key: "whole-90", organ: "whole", azimuth: 90, short: t.extraRight, title: t.orbitRight, hint: t.orbitHint, frame: "tall" },
  { key: "whole-180", organ: "whole", azimuth: 180, short: t.extraBack, title: t.orbitBack, hint: t.orbitHint, frame: "tall" },
  { key: "whole-270", organ: "whole", azimuth: 270, short: t.extraLeft, title: t.orbitLeft, hint: t.orbitHint, frame: "tall" },
];

export const ALL_STEPS: ScanStep[] = [...CORE_STEPS, ...EXTRA_STEPS];

/** Photos without which the species cannot be identified. */
export const REQUIRED_KEYS = ["whole", "bark", "leaf"];

export function stepByKey(key: string): ScanStep | undefined {
  return ALL_STEPS.find((s) => s.key === key);
}

/** Where the trunk edges start on the DBH photo (fractions of its width). */
export const DEFAULT_EDGES = { left: 0.35, right: 0.65 };

/** Phone photos in portrait: width / height. */
export const PHOTO_ASPECT = 3 / 4;

/** Printed QR plate side (cm) — must match the server's `QR_TAG_SIZE_CM`. */
export const QR_PLATE_CM = 8;

/** Quick distance picks (m) when no sensor nor plate gives it. */
export const DISTANCE_PRESETS = [1.5, 2, 2.5, 3];

/**
 * The camera preview fills the screen ("cover"), so it shows only the middle
 * of the photo when the screen is narrower than the photo. Maps a fraction of
 * the photo width to a fraction of the preview width.
 */
export function previewFraction(photoFrac: number, viewW: number, viewH: number, aspect = PHOTO_ASPECT): number {
  if (!(viewW > 0) || !(viewH > 0)) return photoFrac;
  const viewAspect = viewW / viewH;
  if (viewAspect >= aspect) return photoFrac;
  const visible = viewAspect / aspect;
  return 0.5 + (photoFrac - 0.5) / visible;
}

/** Side of a detected code in preview points (average of the four sides). */
export function codeSidePx(event: {
  cornerPoints?: { x: number; y: number }[];
  bounds?: { size?: { width: number; height: number } };
}): number | null {
  const pts = event.cornerPoints;
  if (pts && pts.length === 4) {
    let sum = 0;
    for (let i = 0; i < 4; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      sum += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return sum / 4 > 0 ? sum / 4 : null;
  }
  const size = event.bounds?.size;
  if (size && size.width > 0 && size.height > 0) return (size.width + size.height) / 2;
  return null;
}

/**
 * Live, approximate phone-to-plate distance from the plate's size in the
 * preview — a guide only; the server measures it again on the full photo.
 */
export function plateDistanceFromPreview(
  sidePx: number,
  viewW: number,
  viewH: number,
  focal35mm = DEFAULT_FOCAL_35MM,
  plateCm = QR_PLATE_CM,
  aspect = PHOTO_ASPECT,
): number | null {
  if (!(sidePx > 0) || !(viewW > 0) || !(viewH > 0)) return null;
  const viewAspect = viewW / viewH;
  const photoW = viewAspect < aspect ? viewH * aspect : viewW;
  const photoH = photoW / aspect;
  const distance = (focalPx(focal35mm, photoW, photoH) * plateCm) / 100 / sidePx;
  return distance >= 0.3 && distance <= 10 ? distance : null;
}
