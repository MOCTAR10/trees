import { Platform, Vibration } from "react-native";

/**
 * Short vibrations on touch, through React Native's own Vibration module (no
 * new native module, so it ships over the air). Android only: iOS ignores the
 * duration and the browser has no motor. Most phones use a small rotating
 * motor that needs about 20–25 ms to spin up: shorter pulses are not felt.
 */
const DURATION_MS = {
  tap: 25,
  select: 35,
  confirm: 50,
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
