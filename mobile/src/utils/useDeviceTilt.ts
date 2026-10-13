import { DeviceMotion } from "expo-sensors";
import { useEffect, useState } from "react";

import { cameraElevationDeg, rollDeg } from "./tilt";

export interface DeviceTilt {
  available: boolean;
  elevationDeg: number;
  rollDeg: number;
}

const UPDATE_MS = 120;

/** Live phone attitude while `active` (sensor released otherwise). */
export function useDeviceTilt(active: boolean): DeviceTilt {
  const [tilt, setTilt] = useState<DeviceTilt>({ available: false, elevationDeg: 0, rollDeg: 0 });

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    void (async () => {
      try {
        if (!(await DeviceMotion.isAvailableAsync()) || cancelled) return;
        DeviceMotion.setUpdateInterval(UPDATE_MS);
        subscription = DeviceMotion.addListener((data) => {
          const rotation = data?.rotation;
          if (!rotation) return;
          setTilt({
            available: true,
            elevationDeg: cameraElevationDeg(rotation.beta),
            rollDeg: rollDeg(rotation.gamma),
          });
        });
        if (cancelled) subscription.remove();
      } catch {
        // No motion sensor: the guidance simply stays hidden.
      }
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active]);

  return tilt;
}
