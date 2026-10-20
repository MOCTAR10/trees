/**
 * Phone attitude helpers for the scanner (expo-sensors DeviceMotion).
 *
 * `rotation.beta` is the pitch: 0 when the phone lies flat screen-up, π/2 when
 * it stands upright with the back camera facing the tree. The camera's line of
 * sight therefore points `beta − π/2` above the horizon. `rotation.gamma` is
 * the roll (sideways lean) that skews a trunk in the DBH photo.
 */

const DEG = 180 / Math.PI;

/** Camera elevation above the horizon (degrees, positive = aiming up). */
export function cameraElevationDeg(betaRad: number): number {
  return (betaRad - Math.PI / 2) * DEG;
}

export function rollDeg(gammaRad: number): number {
  return gammaRad * DEG;
}

/**
 * Attitude from gravity alone, for phones without a gyroscope (no fused
 * rotation sensor). `x, y, z` is the accelerometer in g with Android's axes:
 * +y towards the top edge, +z out of the screen, reading +1 on z when the
 * phone lies flat screen-up. The back camera looks along −z, so its elevation
 * is `asin(−z)`; the roll is the lean of the long edge from the vertical
 * (positive when the top leans right). Returns `null` while the phone is
 * being shaken too hard to tell where down is.
 */
export function tiltFromGravity(x: number, y: number, z: number): { elevationDeg: number; rollDeg: number } | null {
  const g = Math.hypot(x, y, z);
  if (!(g > 0.5 && g < 1.5)) return null;
  const elevation = Math.asin(Math.max(-1, Math.min(1, -z / g))) * DEG;
  const roll = Math.atan2(-x, y) * DEG;
  return { elevationDeg: elevation, rollDeg: roll };
}

/** Tolerances for a straight DBH photo (degrees). */
export const LEVEL_ROLL_DEG = 3;
export const LEVEL_PITCH_DEG = 6;

/** Phone upright and not leaning sideways: the trunk silhouette is unbiased. */
export function isLevel(elevationDeg: number, roll: number): boolean {
  return Math.abs(roll) <= LEVEL_ROLL_DEG && Math.abs(elevationDeg) <= LEVEL_PITCH_DEG;
}

/** Plausible total height of a measured tree (m), as accepted by the API. */
export const HEIGHT_RANGE_M: [number, number] = [1.3, 80];

/**
 * Tangent clinometer: horizontal distance to the trunk and the sight angles to
 * the tree top and its base give the height `d · (tan top − tan base)`.
 * Returns `null` when the inputs cannot describe a standing tree.
 */
export function clinometerHeight(distanceM: number, topDeg: number, baseDeg: number): number | null {
  if (!(distanceM > 0) || !(topDeg > baseDeg) || topDeg >= 89 || baseDeg <= -89) return null;
  const height = distanceM * (Math.tan(topDeg / DEG) - Math.tan(baseDeg / DEG));
  if (height < HEIGHT_RANGE_M[0] || height > HEIGHT_RANGE_M[1]) return null;
  return Math.round(height * 10) / 10;
}
