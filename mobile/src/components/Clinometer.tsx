import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";
import { clinometerHeight } from "../utils/tilt";
import { useDeviceTilt } from "../utils/useDeviceTilt";

const t = fr.clinometer;

type Step = "distance" | "top" | "base" | "result";

interface Props {
  visible: boolean;
  /** Horizontal distance already known (e.g. the DBH distance), in metres. */
  initialDistanceM?: number;
  onDone: (heightM: number) => void;
  onClose: () => void;
}

/**
 * Tangent clinometer: the operator stands at a known horizontal distance,
 * sights the tree top then its base through the phone; the motion sensor
 * gives both angles and the height follows (`d · (tan top − tan base)`).
 */
export default function Clinometer({ visible, initialDistanceM, onDone, onClose }: Props) {
  const tilt = useDeviceTilt(visible);
  const [step, setStep] = useState<Step>("distance");
  const [distanceText, setDistanceText] = useState("");
  const [topDeg, setTopDeg] = useState<number | null>(null);
  const [baseDeg, setBaseDeg] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep("distance");
    setTopDeg(null);
    setBaseDeg(null);
    setDistanceText(initialDistanceM ? String(initialDistanceM) : "");
  }, [visible, initialDistanceM]);

  const distance = parseFloat(distanceText.replace(",", "."));
  const height =
    topDeg != null && baseDeg != null ? clinometerHeight(distance, topDeg, baseDeg) : null;

  const capture = () => {
    if (step === "top") {
      setTopDeg(tilt.elevationDeg);
      setStep("base");
    } else if (step === "base") {
      setBaseDeg(tilt.elevationDeg);
      setStep("result");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="clinometer">
          <Text style={styles.title}>{t.title}</Text>

          {!tilt.available && step !== "distance" ? (
            <Text style={styles.warning}>{t.noSensor}</Text>
          ) : null}

          {step === "distance" ? (
            <>
              <Text style={styles.hint}>{t.distanceHint}</Text>
              <TextInput
                testID="clino-distance"
                style={styles.input}
                value={distanceText}
                onChangeText={setDistanceText}
                keyboardType="numeric"
                placeholder="15"
                placeholderTextColor={colors.textDim}
              />
              <TouchableOpacity
                testID="clino-start"
                style={[styles.primary, !(distance > 0) && styles.disabled]}
                disabled={!(distance > 0)}
                onPress={() => setStep("top")}
              >
                <Text style={styles.primaryText}>{t.start}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {step === "top" || step === "base" ? (
            <>
              <Text style={styles.hint}>{step === "top" ? t.aimTop : t.aimBase}</Text>
              <Text style={styles.angle} testID="clino-angle">
                {`${tilt.elevationDeg >= 0 ? "+" : ""}${tilt.elevationDeg.toFixed(1)}°`}
              </Text>
              <TouchableOpacity testID="clino-capture" style={styles.primary} onPress={capture}>
                <Text style={styles.primaryText}>{step === "top" ? t.markTop : t.markBase}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {step === "result" ? (
            <>
              <Text style={styles.hint}>
                {t.angles(topDeg ?? 0, baseDeg ?? 0, distance)}
              </Text>
              {height != null ? (
                <Text style={styles.result} testID="clino-result">{`${height.toFixed(1)} m`}</Text>
              ) : (
                <Text style={styles.warning}>{t.invalid}</Text>
              )}
              <View style={styles.row}>
                <TouchableOpacity
                  testID="clino-retry"
                  style={styles.secondary}
                  onPress={() => setStep("top")}
                >
                  <Text style={styles.secondaryText}>{t.retry}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="clino-use"
                  style={[styles.primary, styles.flex, height == null && styles.disabled]}
                  disabled={height == null}
                  onPress={() => height != null && onDone(height)}
                >
                  <Text style={styles.primaryText}>{t.use}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          <TouchableOpacity testID="clino-close" onPress={onClose} style={styles.close}>
            <Text style={styles.secondaryText}>{t.close}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: type.heading, fontWeight: "800" },
  hint: { color: colors.textDim, fontSize: type.body },
  warning: { color: colors.warning, fontSize: type.body },
  angle: { color: colors.accent, fontSize: 44, fontWeight: "800", textAlign: "center" },
  result: { color: colors.success, fontSize: 40, fontWeight: "800", textAlign: "center" },
  input: {
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 8,
    padding: spacing.sm,
    fontSize: type.body,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: "center",
  },
  row: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  primary: {
    backgroundColor: colors.accent,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  close: { alignItems: "center", paddingVertical: spacing.sm },
  disabled: { opacity: 0.4 },
});
