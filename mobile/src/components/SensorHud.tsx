import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { useDeviceTilt } from "../utils/useDeviceTilt";

export interface SensorHudProps {
  gps: "waiting" | "ok" | "error";
  position: { lat: number; lon: number } | null;
  depthSensor: boolean;
  aiSegmentation: boolean;
  /** Hide the centre reticle and horizon where the framing guide needs a clear view (diameter step). */
  clearCentre?: boolean;
}

const GOLD = "#D9B04A";
const GREEN = "#7BE0A0";
const AMBER = "#E8A93A";
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const SCAN_PERIOD_MS = 3200;
const SPIN_PERIOD_MS = 9000;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReduced(value))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return reduced;
}

function loop(value: Animated.Value, duration: number, easing = Easing.linear) {
  value.setValue(0);
  const animation = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: true }));
  animation.start();
  return animation;
}

function Row({ ok, label, value }: { ok: boolean | null; label: string; value: string }) {
  const color = ok === null ? "rgba(255,255,255,0.55)" : ok ? GREEN : AMBER;
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Futuristic overlay that mirrors the sensors the scanner really reads (display only). */
export default function SensorHud({ gps, position, depthSensor, aiSegmentation, clearCentre }: SensorHudProps) {
  const tilt = useDeviceTilt(true);
  const reduced = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (reduced) return undefined;
    const animations = [loop(sweep, SCAN_PERIOD_MS), loop(spin, SPIN_PERIOD_MS), loop(pulse, 1600, Easing.inOut(Easing.quad))];
    return () => animations.forEach((a) => a.stop());
  }, [reduced, sweep, spin, pulse]);

  const sweepY = sweep.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(height - 2, 0)] });
  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const glow = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 1, 0.45] });

  const gpsValue =
    gps === "ok" && position
      ? `${position.lat.toFixed(4)}  ${position.lon.toFixed(4)}`
      : gps === "waiting"
        ? "RECHERCHE…"
        : "INDISPONIBLE";
  const roll = tilt.rollDeg;
  const horizonShift = Math.max(-60, Math.min(60, tilt.elevationDeg)) * 1.2;

  return (
    <View
      style={styles.fill}
      pointerEvents="none"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="sensor-hud"
    >
      <Animated.View style={[styles.corners, { opacity: glow }]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Path d="M2 12 V2 H12" stroke={GOLD} strokeWidth={0.7} fill="none" />
          <Path d="M88 2 H98 V12" stroke={GOLD} strokeWidth={0.7} fill="none" />
          <Path d="M2 88 V98 H12" stroke={GOLD} strokeWidth={0.7} fill="none" />
          <Path d="M88 98 H98 V88" stroke={GOLD} strokeWidth={0.7} fill="none" />
        </Svg>
      </Animated.View>

      {reduced ? null : <Animated.View style={[styles.sweep, { transform: [{ translateY: sweepY }] }]} />}

      {clearCentre ? null : (
        <View style={styles.centre}>
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <Svg width={150} height={150} viewBox="0 0 150 150">
              <Circle cx={75} cy={75} r={66} stroke={GOLD} strokeWidth={1.2} strokeDasharray="4 10" fill="none" opacity={0.85} />
              <Circle cx={75} cy={75} r={46} stroke="#FFFFFF" strokeWidth={0.8} strokeDasharray="1 6" fill="none" opacity={0.6} />
            </Svg>
          </Animated.View>
          <View style={styles.cross}>
            <Svg width={150} height={150} viewBox="0 0 150 150">
              <Line x1={75} y1={58} x2={75} y2={92} stroke={GOLD} strokeWidth={1} />
              <Line x1={58} y1={75} x2={92} y2={75} stroke={GOLD} strokeWidth={1} />
              <Circle cx={75} cy={75} r={3} fill={GOLD} />
            </Svg>
          </View>
          {tilt.available ? (
            <View
              style={[styles.horizon, { transform: [{ translateY: horizonShift }, { rotate: `${-roll}deg` }] }]}
              testID="hud-horizon"
            />
          ) : null}
        </View>
      )}

      <View style={styles.panel}>
        <Row ok={gps === "ok" ? true : gps === "waiting" ? null : false} label="GPS" value={gpsValue} />
        <Row
          ok={tilt.available}
          label="INCL."
          value={tilt.available ? `${Math.round(tilt.elevationDeg)}°  ROULIS ${Math.round(roll)}°` : "ABSENTE"}
        />
        <Row ok={depthSensor} label="PROF." value={depthSensor ? "CAPTEUR ACTIF" : "PLAQUE QR"} />
        <Row ok label="QR" value="LECTURE ACTIVE" />
        {aiSegmentation ? <Row ok label="IA" value="SEGMENTATION" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill as object, overflow: "hidden" },
  corners: { ...StyleSheet.absoluteFill as object, margin: 10 },
  sweep: { position: "absolute", left: 0, right: 0, top: 0, height: 2, backgroundColor: "rgba(217,176,74,0.35)" },
  centre: { ...StyleSheet.absoluteFill as object, alignItems: "center", justifyContent: "center" },
  cross: { position: "absolute" },
  horizon: { position: "absolute", width: "78%", height: 1.5, backgroundColor: "rgba(123,224,160,0.8)" },
  panel: {
    position: "absolute",
    right: 14,
    top: 10,
    gap: 3,
    backgroundColor: "rgba(8,20,14,0.62)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { color: "rgba(255,255,255,0.7)", fontFamily: MONO, fontSize: 10, width: 38, letterSpacing: 0.6 },
  value: { fontFamily: MONO, fontSize: 10, letterSpacing: 0.4 },
});
