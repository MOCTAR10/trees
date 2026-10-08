import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { CapturedImage } from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

const t = fr.capture;

type Step = {
  key: "trunk" | "leaf" | "habitat";
  title: string;
  hint: string;
};

const STEPS: Step[] = [
  { key: "trunk", title: t.trunk, hint: t.trunkHint },
  { key: "leaf", title: t.leaf, hint: t.leafHint },
  { key: "habitat", title: t.habitat, hint: t.habitatHint },
];

export interface CaptureResult {
  trunk: CapturedImage;
  leaf: CapturedImage;
  habitat: CapturedImage;
  latitude: number;
  longitude: number;
  arDepthM: number;
}

interface Props {
  onCaptured: (result: CaptureResult) => void;
}

export default function CaptureScreen({ onCaptured }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [stepIndex, setStepIndex] = useState(0);
  const [previews, setPreviews] = useState<Partial<Record<Step["key"], CapturedImage>>>({});
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "ok" | "error">("waiting");
  const [depthText, setDepthText] = useState("1.30");
  const [submitting, setSubmitting] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGpsStatus("error");
        return;
      }
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsStatus("ok");
      } catch {
        setGpsStatus("error");
      }
    })();
  }, []);

  const step = STEPS[stepIndex];
  const preview = previews[step.key];
  const allCaptured = STEPS.every((s) => previews[s.key]);
  const depth = parseFloat(depthText.replace(",", "."));

  const takePicture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (!photo) return;
    setPreviews((prev) => ({
      ...prev,
      [step.key]: { uri: photo.uri, name: `${step.key}.jpg`, type: "image/jpeg" },
    }));
  };

  const submit = () => {
    if (!allCaptured || !position || !(depth > 0)) return;
    setSubmitting(true);
    onCaptured({
      trunk: previews.trunk!,
      leaf: previews.leaf!,
      habitat: previews.habitat!,
      latitude: position.lat,
      longitude: position.lon,
      arDepthM: depth,
    });
  };

  if (!permission) return <View style={styles.center} />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{t.trunkHint}</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Autoriser la caméra</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t.step(stepIndex + 1, STEPS.length)}</Text>
      <Text style={styles.heading}>{step.title}</Text>
      <Text style={styles.hint}>{step.hint}</Text>

      <View style={styles.cameraFrame}>
        {preview ? (
          <Image source={{ uri: preview.uri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        )}
      </View>

      {gpsStatus !== "ok" && (
        <Text style={styles.gpsWarn}>
          {gpsStatus === "waiting" ? t.gpsWaiting : t.gpsUnavailable}
        </Text>
      )}
      {gpsStatus === "ok" && (
        <Text style={styles.gpsOk}>
          {t.gpsOk} ({position!.lat.toFixed(4)}, {position!.lon.toFixed(4)})
        </Text>
      )}

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => setPreviews((p) => ({ ...p, [step.key]: undefined }))}
        >
          <Text style={styles.buttonText}>{t.retake}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={takePicture}>
          <Text style={styles.buttonText}>📷 {step.title}</Text>
        </TouchableOpacity>
      </View>

      {stepIndex < STEPS.length - 1 && preview && (
        <TouchableOpacity
          style={[styles.button, styles.wideButton]}
          onPress={() => setStepIndex((i) => i + 1)}
        >
          <Text style={styles.buttonText}>{t.next} →</Text>
        </TouchableOpacity>
      )}

      {stepIndex === STEPS.length - 1 && (
        <View style={styles.finalBlock}>
          <Text style={styles.hint}>{t.depthHint}</Text>
          <TextInput
            style={styles.input}
            value={depthText}
            onChangeText={setDepthText}
            keyboardType="numeric"
            placeholder={t.depthLabel}
            placeholderTextColor={colors.textDim}
          />
          <TouchableOpacity
            style={[styles.button, styles.wideButton, !allCaptured && styles.disabled]}
            disabled={!allCaptured || !position || submitting}
            onPress={submit}
          >
            {submitting ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.buttonText}>{t.analyze}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  title: { color: colors.accent, fontSize: type.caption, textTransform: "uppercase" },
  heading: { color: colors.text, fontSize: type.title, fontWeight: "700" },
  hint: { color: colors.textDim, fontSize: type.body, marginBottom: spacing.sm },
  cameraFrame: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.surface,
    aspectRatio: 3 / 4,
    marginVertical: spacing.sm,
  },
  camera: { flex: 1 },
  preview: { flex: 1 },
  row: { flexDirection: "row", gap: spacing.sm },
  button: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonSecondary: { backgroundColor: colors.surfaceAlt },
  wideButton: { marginTop: spacing.sm },
  disabled: { opacity: 0.4 },
  buttonText: { color: colors.text, fontSize: type.body, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: type.body,
    borderWidth: 1,
    borderColor: colors.border,
  },
  finalBlock: { marginTop: spacing.sm, gap: spacing.sm },
  gpsOk: { color: colors.success, fontSize: type.caption },
  gpsWarn: { color: colors.warning, fontSize: type.caption },
});
