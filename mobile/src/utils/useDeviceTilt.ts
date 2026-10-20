import { Accelerometer, DeviceMotion } from "expo-sensors";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { cameraElevationDeg, rollDeg, tiltFromGravity } from "./tilt";

export interface DeviceTilt {
  available: boolean;
  elevationDeg: number;
  rollDeg: number;
}

const UPDATE_MS = 120;
/** Fused rotation that never reports within this delay: fall back to gravity. */
const ROTATION_TIMEOUT_MS = 1500;
/** Smoothing of the raw accelerometer (0 = frozen, 1 = raw). */
const SMOOTHING = 0.3;

/**
 * Live phone attitude while `active` (sensors released otherwise).
 *
 * The fused DeviceMotion rotation is used when the phone has it. On Android,
 * expo-sensors only reports DeviceMotion as available when the phone has a
 * gyroscope, a rotation-vector, a gravity and a linear-acceleration sensor;
 * many entry-level phones have no gyroscope, so the attitude is then read
 * from the accelerometer alone, which every phone has.
 */
export function useDeviceTilt(active: boolean): DeviceTilt {
  const [tilt, setTilt] = useState<DeviceTilt>({ available: false, elevationDeg: 0, rollDeg: 0 });

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let motion: { remove: () => void } | null = null;
    let gravity: { remove: () => void } | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let fused = false;

    const startGravity = async () => {
      if (cancelled || gravity) return;
      try {
        if (!(await Accelerometer.isAvailableAsync()) || cancelled) return;
        motion?.remove();
        motion = null;
        Accelerometer.setUpdateInterval(UPDATE_MS);
        const sign = Platform.OS === "ios" ? -1 : 1;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let primed = false;
        gravity = Accelerometer.addListener((data) => {
          if (!data) return;
          const x = sign * data.x;
          const y = sign * data.y;
          const z = sign * data.z;
          sx = primed ? sx + SMOOTHING * (x - sx) : x;
          sy = primed ? sy + SMOOTHING * (y - sy) : y;
          sz = primed ? sz + SMOOTHING * (z - sz) : z;
          primed = true;
          const attitude = tiltFromGravity(sx, sy, sz);
          if (attitude) setTilt({ available: true, ...attitude });
        });
        if (cancelled) gravity.remove();
      } catch {
        // No accelerometer either: the guidance simply stays hidden.
      }
    };

    void (async () => {
      try {
        if (await DeviceMotion.isAvailableAsync()) {
          if (cancelled) return;
          DeviceMotion.setUpdateInterval(UPDATE_MS);
          motion = DeviceMotion.addListener((data) => {
            const rotation = data?.rotation;
            if (!rotation || gravity) return;
            fused = true;
            setTilt({
              available: true,
              elevationDeg: cameraElevationDeg(rotation.beta),
              rollDeg: rollDeg(rotation.gamma),
            });
          });
          if (cancelled) {
            motion.remove();
            return;
          }
          watchdog = setTimeout(() => {
            if (!fused) void startGravity();
          }, ROTATION_TIMEOUT_MS);
          return;
        }
      } catch {
        // Fall through to the accelerometer.
      }
      await startGravity();
    })();

    return () => {
      cancelled = true;
      if (watchdog) clearTimeout(watchdog);
      motion?.remove();
      gravity?.remove();
    };
  }, [active]);

  return tilt;
}
