import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * Native depth sensor: iPhone/iPad Pro LiDAR (AVFoundation) or Android
 * ARCore Depth. Present only in an Expo Development Build — in Expo Go the
 * native module does not exist and every call reports "unavailable", so the
 * scanner falls back to the QR plate, the typed distance or the AI estimate.
 */

export interface DepthReading {
  /** Distance from the camera to the surface at the frame centre (m). */
  distanceM: number;
  /** Share of valid depth pixels in the central window (0..1). */
  confidence: number;
  source: "lidar" | "arcore";
}

interface NativeDepthSensor {
  isAvailableAsync(): Promise<boolean>;
  measureCenterAsync(): Promise<DepthReading | null>;
}

const native = requireOptionalNativeModule<NativeDepthSensor>("DepthSensor");

/** Plausible bark distance for a DBH photo (m). */
export const DEPTH_RANGE_M: [number, number] = [0.3, 10];

export async function isDepthSensorAvailable(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isAvailableAsync();
  } catch {
    return false;
  }
}

/** One centre-of-frame distance reading, or `null` when unusable. */
export async function measureCenterDistance(): Promise<DepthReading | null> {
  if (!native) return null;
  try {
    const reading = await native.measureCenterAsync();
    if (!reading) return null;
    const { distanceM, confidence } = reading;
    if (!(distanceM >= DEPTH_RANGE_M[0] && distanceM <= DEPTH_RANGE_M[1]) || confidence < 0.3) {
      return null;
    }
    return reading;
  } catch {
    return null;
  }
}
