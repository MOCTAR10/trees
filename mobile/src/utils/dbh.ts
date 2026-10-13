/**
 * On-phone DBH from the trunk edges the operator placed on the photo —
 * the same exact tangent-silhouette geometry as the server
 * (`app/core/geometry.py::diameter_from_edges_cm`), so it works offline.
 */

/** Diagonal of a 36x24 mm frame: reference of 35 mm-equivalent focals. */
const FULL_FRAME_DIAGONAL_MM = Math.hypot(36, 24);

/** Typical phone main camera when the photo carries no EXIF focal. */
export const DEFAULT_FOCAL_35MM = 26;

/** DBH range (cm) accepted as a measurement, as on the server. */
export const PLAUSIBLE_DBH_CM: [number, number] = [5, 400];

export function focalPx(focal35mm: number, widthPx: number, heightPx: number): number {
  return (focal35mm * Math.hypot(widthPx, heightPx)) / FULL_FRAME_DIAGONAL_MM;
}

export interface EdgeInput {
  /** Edges as fractions (0..1) of the displayed photo width. */
  left: number;
  right: number;
  widthPx: number;
  heightPx: number;
  focal35mm?: number;
  distanceM: number;
}

/** Diameter in cm, or `null` when the inputs cannot describe a trunk. */
export function dbhFromEdges(input: EdgeInput): number | null {
  const { left, right, widthPx, heightPx, distanceM } = input;
  if (!(right > left) || !(widthPx > 0) || !(heightPx > 0) || !(distanceM > 0)) return null;
  const f = focalPx(input.focal35mm ?? DEFAULT_FOCAL_35MM, widthPx, heightPx);
  const center = widthPx / 2;
  const aLeft = Math.atan((left * widthPx - center) / f);
  const aRight = Math.atan((right * widthPx - center) / f);
  const sinA = Math.sin((aRight - aLeft) / 2);
  if (!(sinA > 0) || sinA >= 1) return null;
  return (2 * distanceM * 100 * sinA) / (1 - sinA);
}

export function isPlausibleDbh(cm: number | null): boolean {
  return cm != null && cm >= PLAUSIBLE_DBH_CM[0] && cm <= PLAUSIBLE_DBH_CM[1];
}

/** Minimum gap between the two edges (fraction of the photo width). */
export const MIN_EDGE_GAP = 0.02;

/**
 * New edges after dragging one line by `dxPx` on screen, from the value it had
 * when the drag started. Stays inside the photo and never crosses the other line.
 */
export function moveEdge(
  edges: { left: number; right: number },
  side: "left" | "right",
  startValue: number,
  dxPx: number,
  displayedWidthPx: number,
): { left: number; right: number } {
  if (!(displayedWidthPx > 0)) return edges;
  let value = startValue + dxPx / displayedWidthPx;
  if (side === "left") value = Math.max(0, Math.min(value, edges.right - MIN_EDGE_GAP));
  else value = Math.min(1, Math.max(value, edges.left + MIN_EDGE_GAP));
  return { ...edges, [side]: value };
}
