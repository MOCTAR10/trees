import { Platform, Vibration } from "react-native";

/**
 * Short vibrations on touch, through React Native's own Vibration module (no
 * new native module, so it ships over the air). Android only: iOS ignores the
 * duration and the browser has no motor.
 */
const DURATION_MS = {
  tap: 10,
  select: 16,
  confirm: 26,
} as const;

export type HapticKind = keyof typeof DURATION_MS;

let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function haptic(kind: HapticKind = "tap"): void {
  if (!enabled || Platform.OS !== "android") return;
  try {
    Vibration.vibrate(DURATION_MS[kind]);
  } catch {
    // A phone without a vibrator simply stays silent.
  }
}
