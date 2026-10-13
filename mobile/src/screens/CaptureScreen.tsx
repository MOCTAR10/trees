import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  Camera as CameraIcon,
  ChevronLeft,
  ChevronRight,
  Flashlight,
  FlashlightOff,
  ImagePlus,
  QrCode,
  RotateCcw,
  Ruler,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  CapturedImage,
  CaptureShot,
  getScanCapabilities,
  HeightSource,
  Organ,
  ScanCapabilities,
  TreeMeasurements,
} from "../api/client";
import Clinometer from "../components/Clinometer";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";
import { isLevel } from "../utils/tilt";
import { useDeviceTilt } from "../utils/useDeviceTilt";

const t = fr.capture;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GPS_TIMEOUT_MS = 20000;

type Mode = "full" | "quick";
type MeasureMode = "photo" | "tape" | "caliper";

const MEASURE_MODES: { key: MeasureMode; label: string }[] = [
  { key: "photo", label: t.modePhoto },
  { key: "tape", label: t.modeTape },
  { key: "caliper", label: t.modeCaliper },
];

function parseNum(text: string): number {
  return parseFloat(text.replace(",", "."));
}

/** 35 mm-equivalent focal from EXIF (iOS and Android spell it the same). */
export function exifFocal35mm(exif: Record<string, unknown> | null | undefined): number | undefined {
  const raw = exif?.FocalLenIn35mmFilm ?? exif?.FocalLengthIn35mmFilm;
  const value = typeof raw === "string" ? parseFloat(raw) : (raw as number | undefined);
  return typeof value === "number" && value > 0 ? value : undefined;
}

interface CaptureStep {
  key: string;
  organ: Organ;
  azimuth?: number;
  title: string;
  hint: string;
  required: boolean;
}

interface StepShot {
  image: CapturedImage;
  imported: boolean;
  focal35mm?: number;
}

const FULL_STEPS: CaptureStep[] = [
  { key: "whole-0", organ: "whole", azimuth: 0, title: t.orbitFront, hint: t.orbitHint, required: true },
  { key: "whole-90", organ: "whole", azimuth: 90, title: t.orbitRight, hint: t.orbitHint, required: false },
  { key: "whole-180", organ: "whole", azimuth: 180, title: t.orbitBack, hint: t.orbitHint, required: false },
  { key: "whole-270", organ: "whole", azimuth: 270, title: t.orbitLeft, hint: t.orbitHint, required: false },
  { key: "dbh", organ: "dbh", title: t.dbhShot, hint: t.dbhShotHint, required: false },
  { key: "bark", organ: "bark", title: t.trunk, hint: t.trunkHint, required: true },
  { key: "bark-2", organ: "bark", title: t.barkAngle2, hint: t.trunkHint, required: false },
  { key: "leaf-top", organ: "leaf", title: t.leafTop, hint: t.leafHint, required: true },
  { key: "leaf-under", organ: "leaf", title: t.leafUnder, hint: t.leafHint, required: false },
  { key: "flower", organ: "flower", title: t.flower, hint: t.flowerHint, required: false },
  { key: "fruit", organ: "fruit", title: t.fruit, hint: t.fruitHint, required: false },
];

const QUICK_STEPS: CaptureStep[] = [
  { key: "trunk", organ: "bark", title: t.trunk, hint: t.trunkHint, required: true },
  { key: "leaf", organ: "leaf", title: t.leaf, hint: t.leafHint, required: true },
  { key: "habitat", organ: "whole", title: t.habitat, hint: t.habitatHint, required: true },
  { key: "dbh", organ: "dbh", title: t.dbhShot, hint: t.dbhShotHint, required: false },
];

export interface CaptureResult extends TreeMeasurements {
  shots: CaptureShot[];
  latitude: number;
  longitude: number;
}

interface Props {
  onCaptured: (result: CaptureResult) => void;
  onBack: () => void;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gate = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("gps timeout")), ms);
  });
  return Promise.race([promise, gate]).finally(() => clearTimeout(timer));
}

export default function CaptureScreen({ onCaptured, onBack }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>("full");
  const [stepIndex, setStepIndex] = useState(0);
  const [previews, setPreviews] = useState<Record<string, StepShot>>({});
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "ok" | "error">("waiting");
  const [depthText, setDepthText] = useState("");
  const [measureMode, setMeasureMode] = useState<MeasureMode>("photo");
  const [refText, setRefText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [heightSource, setHeightSource] = useState<HeightSource>("manual");
  const [caps, setCaps] = useState<ScanCapabilities>({ ai_segmentation: false, ai_distance: false });
  const [clinoOpen, setClinoOpen] = useState(false);
  const [scanningQr, setScanningQr] = useState(false);
  const [treeCode, setTreeCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [taking, setTaking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const positionRef = useRef<{ lat: number; lon: number } | null>(null);

  const steps = mode === "full" ? FULL_STEPS : QUICK_STEPS;

  const setPos = useCallback((p: { lat: number; lon: number }) => {
    positionRef.current = p;
    setPosition(p);
    setGpsStatus("ok");
  }, []);

  const locate = useCallback(
    async (precise: boolean) => {
      setGpsStatus("waiting");
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setGpsStatus("error");
          return;
        }
        if (!precise) {
          try {
            const last = await Location.getLastKnownPositionAsync();
            if (last) {
              setPos({ lat: last.coords.latitude, lon: last.coords.longitude });
            }
          } catch {
            // Fall through to a fresh fix.
          }
        }
        const pos = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: precise ? Location.Accuracy.High : Location.Accuracy.Balanced,
          }),
          GPS_TIMEOUT_MS,
        );
        setPos({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      } catch {
        if (!positionRef.current) setGpsStatus("error");
        else setGpsStatus("ok");
      }
    },
    [setPos],
  );

  useEffect(() => {
    void locate(false);
  }, [locate]);

  useEffect(() => {
    let alive = true;
    void getScanCapabilities().then((c) => alive && setCaps(c));
    return () => {
      alive = false;
    };
  }, []);

  const step = steps[stepIndex];
  const shot = previews[step.key];
  const requiredTotal = steps.filter((s) => s.required).length;
  const requiredDone = steps.filter((s) => s.required && previews[s.key]).length;
  const allRequired = requiredDone === requiredTotal;
  const shotsTaken = Object.keys(previews).length > 0;
  const depth = parseNum(depthText);
  const reference = parseNum(refText);
  const height = parseNum(heightText);
  const measureReady =
    measureMode === "photo" ? depth > 0 || caps.ai_distance : reference > 0;
  const guiding = step.organ === "dbh" && !shot && !scanningQr;
  const tilt = useDeviceTilt(guiding);
  const level = isLevel(tilt.elevationDeg, tilt.rollDeg);

  const onBarcode = useCallback(({ data }: { data: string }) => {
    const code = data?.trim();
    if (!code) return;
    setTreeCode(code);
    setScanningQr(false);
  }, []);
  const blockReason = !allRequired
    ? t.requiredMissing
    : !position
      ? t.needGps
      : !measureReady
        ? measureMode === "photo"
          ? t.needDepth
          : t.needMeasure
        : null;

  const goBack = useCallback(() => {
    if (!shotsTaken) {
      onBack();
      return;
    }
    Alert.alert(t.discardTitle, t.discardMsg, [
      { text: t.keepEditing, style: "cancel" },
      { text: t.discardYes, style: "destructive", onPress: onBack },
    ]);
  }, [shotsTaken, onBack]);

  const switchMode = useCallback(
    (next: Mode) => {
      if (next === mode) return;
      const apply = () => {
        setMode(next);
        setStepIndex(0);
        setPreviews({});
      };
      if (shotsTaken) {
        Alert.alert(t.discardTitle, t.discardMsg, [
          { text: t.keepEditing, style: "cancel" },
          { text: t.discardYes, style: "destructive", onPress: apply },
        ]);
        return;
      }
      apply();
    },
    [mode, shotsTaken],
  );

  const takePicture = useCallback(async () => {
    if (!cameraRef.current || taking) return;
    setTaking(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, exif: true });
      if (!photo) return;
      const key = step.key;
      setPreviews((prev) => ({
        ...prev,
        [key]: {
          image: { uri: photo.uri, name: `${key}.jpg`, type: "image/jpeg" },
          imported: false,
          focal35mm: exifFocal35mm(photo.exif as Record<string, unknown> | undefined),
        },
      }));
    } finally {
      setTaking(false);
    }
  }, [taking, step.key]);

  const importPhoto = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t.importPhoto, t.galleryDenied);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        exif: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        if (info.exists && "size" in info && info.size > MAX_IMAGE_BYTES) {
          Alert.alert(t.importPhoto, t.tooLarge);
          return;
        }
      } catch {
        // Size check is best-effort; the server enforces the cap.
      }
      const key = step.key;
      setPreviews((prev) => ({
        ...prev,
        [key]: {
          image: {
            uri: asset.uri,
            name: asset.fileName ?? `${key}.jpg`,
            type: asset.mimeType ?? "image/jpeg",
          },
          imported: true,
          focal35mm: exifFocal35mm(asset.exif as Record<string, unknown> | null | undefined),
        },
      }));
    } finally {
      setImporting(false);
    }
  }, [importing, step.key]);

  const retake = useCallback(() => {
    const key = step.key;
    setPreviews((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  }, [step.key]);

  const submit = useCallback(() => {
    if (blockReason || !position || submitting) return;
    const shots: CaptureShot[] = steps
      .filter((s) => previews[s.key])
      .map((s) => ({
        image: previews[s.key].image,
        organ: s.organ,
        azimuth: s.azimuth,
        focal35mm: previews[s.key].focal35mm,
      }));
    setSubmitting(true);
    onCaptured({
      shots,
      latitude: position.lat,
      longitude: position.lon,
      arDepthM: depth > 0 ? depth : undefined,
      circumferenceCm: measureMode === "tape" ? reference : undefined,
      caliperDbhCm: measureMode === "caliper" ? reference : undefined,
      measuredHeightM: height > 0 ? height : undefined,
      heightSource: height > 0 ? heightSource : undefined,
      treeCode: treeCode ?? undefined,
    });
  }, [
    blockReason,
    position,
    submitting,
    steps,
    previews,
    depth,
    measureMode,
    reference,
    height,
    heightSource,
    treeCode,
    onCaptured,
  ]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Scan</Text>
        <Text style={styles.hintCenter}>{t.cameraDenied}</Text>
        <TouchableOpacity
          testID="allow-camera-button"
          style={styles.button}
          onPress={requestPermission}
        >
          <Text style={styles.buttonText}>{t.allowCamera}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="back-button" style={[styles.button, styles.buttonSecondary]} onPress={onBack}>
          <Text style={styles.buttonText}>{t.back}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="back-button"
          style={styles.backBtn}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t.back}
        >
          <ChevronLeft size={22} color={colors.text} strokeWidth={2.5} />
          <Text style={styles.backText}>{t.back}</Text>
        </TouchableOpacity>
        <View style={styles.topTitles}>
          <Text style={styles.topStep}>
            {t.step(stepIndex + 1, steps.length)} · {requiredDone}/{requiredTotal}
          </Text>
          <Text style={styles.topHeading} numberOfLines={1}>
            {step.title}
          </Text>
        </View>
        <TouchableOpacity
          testID="qr-button"
          style={[styles.iconBtn, (scanningQr || treeCode) && styles.iconBtnOn]}
          onPress={() => setScanningQr((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={t.qrScan}
        >
          <QrCode
            size={20}
            color={scanningQr || treeCode ? colors.primary : colors.text}
            strokeWidth={2}
          />
        </TouchableOpacity>
        <TouchableOpacity
          testID="torch-toggle"
          style={[styles.iconBtn, torchOn && styles.iconBtnOn]}
          onPress={() => setTorchOn((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: torchOn }}
        >
          {torchOn ? (
            <Flashlight size={20} color={colors.primary} strokeWidth={2} />
          ) : (
            <FlashlightOff size={20} color={colors.text} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.main}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.scanner}>
          {shot && !scanningQr ? (
            <Image source={{ uri: shot.image.uri }} style={styles.fill} resizeMode="cover" />
          ) : (
            <CameraView
              ref={cameraRef}
              style={styles.fill}
              facing="back"
              flash="off"
              enableTorch={torchOn && cameraReady}
              onCameraReady={() => setCameraReady(true)}
              barcodeScannerSettings={
                scanningQr ? { barcodeTypes: ["qr", "code128", "datamatrix"] } : undefined
              }
              onBarcodeScanned={scanningQr ? onBarcode : undefined}
            />
          )}

          {scanningQr ? (
            <View style={styles.qrOverlay} testID="qr-overlay">
              <View style={styles.qrFrame} pointerEvents="none" />
              <Text style={styles.guideText}>{t.qrHint}</Text>
              <TouchableOpacity
                testID="qr-cancel"
                style={styles.qrCancel}
                onPress={() => setScanningQr(false)}
              >
                <Text style={styles.buttonText}>{t.qrCancel}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {guiding ? (
            <View style={styles.guide} pointerEvents="none" testID="dbh-guide">
              <View style={styles.guideLine} />
              <Text style={styles.guideText}>{t.dbhGuide}</Text>
              {tilt.available ? (
                <Text
                  testID="level-indicator"
                  style={[styles.levelBadge, level ? styles.levelOk : styles.levelWarn]}
                >
                  {level ? t.level : t.levelFix(tilt.rollDeg, tilt.elevationDeg)}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.modeFloat}>
            <TouchableOpacity
              testID="mode-full"
              style={[styles.modePill, mode === "full" && styles.modePillOn]}
              onPress={() => switchMode("full")}
            >
              <Text style={[styles.modePillText, mode === "full" && styles.modePillTextOn]}>
                {t.fullMode}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="mode-quick"
              style={[styles.modePill, mode === "quick" && styles.modePillOn]}
              onPress={() => switchMode("quick")}
            >
              <Text style={[styles.modePillText, mode === "quick" && styles.modePillTextOn]}>
                {t.quickMode}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.progressFloat}>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { flex: requiredDone / Math.max(requiredTotal, 1) }]}
              />
              <View style={{ flex: 1 - requiredDone / Math.max(requiredTotal, 1) }} />
            </View>
          </View>

          {shot?.imported ? (
            <View style={styles.importBadge}>
              <Text style={styles.importBadgeText}>{t.imported}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            testID="import-button"
            style={styles.fab}
            onPress={() => void importPhoto()}
            disabled={importing}
            accessibilityRole="button"
            accessibilityLabel={t.importPhoto}
          >
            {importing ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <ImagePlus size={24} color={colors.primary} strokeWidth={2.25} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.sheet}>
          <Text style={styles.hint} numberOfLines={2}>
            {step.hint}
          </Text>

          <View style={styles.gpsRow}>
            {gpsStatus === "ok" && position ? (
              <Text style={styles.gpsOk} numberOfLines={1}>
                {t.gpsOk} ({position.lat.toFixed(4)}, {position.lon.toFixed(4)})
              </Text>
            ) : (
              <Text style={styles.gpsWarn} numberOfLines={1}>
                {gpsStatus === "waiting" ? t.gpsWaiting : t.gpsUnavailable}
              </Text>
            )}
            {gpsStatus === "error" ? (
              <TouchableOpacity
                testID="retry-gps-button"
                style={styles.retryBtn}
                onPress={() => void locate(true)}
              >
                <Text style={styles.retryText}>{t.retry}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.depthRow} accessibilityLabel={t.measureMode}>
            {MEASURE_MODES.map((m) => (
              <TouchableOpacity
                key={m.key}
                testID={`measure-${m.key}`}
                style={[styles.measurePill, measureMode === m.key && styles.measurePillOn]}
                onPress={() => setMeasureMode(m.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: measureMode === m.key }}
              >
                <Text
                  style={[styles.measurePillText, measureMode === m.key && styles.measurePillTextOn]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {treeCode ? (
            <View style={styles.treeChip} testID="tree-chip">
              <Text style={styles.treeChipText} numberOfLines={1}>
                {t.treeLinked(treeCode)}
              </Text>
              <TouchableOpacity
                testID="tree-unlink"
                onPress={() => setTreeCode(null)}
                accessibilityLabel={t.unlinkTree}
              >
                <X size={16} color={colors.primary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.depthRow}>
            <Text style={styles.depthLabel} numberOfLines={1}>
              {measureMode === "photo"
                ? caps.ai_distance
                  ? t.depthAutoLabel
                  : t.depthLabel
                : measureMode === "tape"
                  ? t.tapeLabel
                  : t.caliperLabel}
            </Text>
            {measureMode === "photo" ? (
              <TextInput
                testID="depth-input"
                style={styles.input}
                value={depthText}
                onChangeText={setDepthText}
                keyboardType="numeric"
                placeholder="2.0"
                placeholderTextColor={colors.textDim}
              />
            ) : (
              <TextInput
                testID="reference-input"
                style={styles.input}
                value={refText}
                onChangeText={setRefText}
                keyboardType="numeric"
                placeholder={measureMode === "tape" ? "190" : "60"}
                placeholderTextColor={colors.textDim}
              />
            )}
          </View>

          <View style={styles.depthRow}>
            <Text style={styles.depthLabel} numberOfLines={1}>
              {t.heightLabel}
            </Text>
            <TouchableOpacity
              testID="clinometer-button"
              style={styles.clinoBtn}
              onPress={() => setClinoOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t.clinometer}
            >
              <Ruler size={18} color={colors.primary} strokeWidth={2.25} />
            </TouchableOpacity>
            <TextInput
              testID="height-input"
              style={styles.input}
              value={heightText}
              onChangeText={(text) => {
                setHeightText(text);
                setHeightSource("manual");
              }}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor={colors.textDim}
            />
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              testID="prev-button"
              style={[styles.navBtn, stepIndex === 0 && styles.disabled]}
              disabled={stepIndex === 0}
              onPress={() => setStepIndex((i) => Math.max(0, i - 1))}
              accessibilityLabel={t.previous}
            >
              <ChevronLeft size={22} color={colors.text} strokeWidth={2.5} />
            </TouchableOpacity>
            {shot ? (
              <TouchableOpacity
                testID="retake-button"
                style={[styles.captureBtn, styles.captureSecondary]}
                onPress={retake}
              >
                <RotateCcw size={19} color={colors.text} strokeWidth={2.25} />
                <Text style={styles.buttonText}>{t.retake}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                testID="capture-button"
                style={[styles.captureBtn, taking && styles.disabled]}
                onPress={() => void takePicture()}
                disabled={taking}
              >
                {taking ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <>
                    <CameraIcon size={19} color={colors.text} strokeWidth={2.25} />
                    <Text style={styles.buttonText}>{step.title}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              testID="next-button"
              style={[
                styles.navBtn,
                (stepIndex === steps.length - 1 || (!shot && step.required)) && styles.disabled,
              ]}
              disabled={stepIndex === steps.length - 1 || (!shot && step.required)}
              onPress={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
              accessibilityLabel={!shot && !step.required ? t.skip : t.next}
            >
              <ChevronRight size={22} color={colors.text} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            testID="analyze-button"
            style={[styles.analyzeBtn, (blockReason || submitting) && styles.disabled]}
            disabled={blockReason != null || submitting}
            onPress={submit}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.analyzeText}>{t.analyze}</Text>
            )}
          </TouchableOpacity>
          {blockReason ? (
            <Text style={styles.blockReason} numberOfLines={1}>
              {blockReason}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <Clinometer
        visible={clinoOpen}
        onClose={() => setClinoOpen(false)}
        onDone={(heightM) => {
          setHeightText(String(heightM));
          setHeightSource("clinometer");
          setClinoOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    gap: spacing.sm,
  },
  backBtn: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs },
  backText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  topTitles: { flex: 1, minWidth: 0, alignItems: "center" },
  topStep: { color: colors.accent, fontSize: type.caption, fontWeight: "700" },
  topHeading: { color: colors.text, fontSize: type.body, fontWeight: "800" },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  main: { flex: 1 },
  scanner: { flex: 1, position: "relative", backgroundColor: "#000" },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  modeFloat: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    gap: spacing.sm,
  },
  modePill: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  modePillOn: { backgroundColor: "rgba(212,160,23,0.92)", borderColor: colors.accent },
  modePillText: { color: "#FFFFFF", fontSize: type.caption, fontWeight: "700" },
  modePillTextOn: { color: colors.primary },
  progressFloat: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.sm,
  },
  progressTrack: {
    flexDirection: "row",
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  progressFill: { backgroundColor: colors.accent, borderRadius: 3 },
  importBadge: {
    position: "absolute",
    left: spacing.md,
    bottom: spacing.lg + spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  importBadgeText: { color: colors.primary, fontSize: type.caption, fontWeight: "800" },
  fab: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.lg,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  hint: { color: colors.textDim, fontSize: type.caption, minHeight: 30 },
  gpsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 26,
    gap: spacing.sm,
  },
  gpsOk: { color: colors.success, fontSize: type.caption, flexShrink: 1 },
  gpsWarn: { color: colors.warning, fontSize: type.caption, flexShrink: 1 },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  retryText: { color: colors.accent, fontSize: type.caption, fontWeight: "700" },
  depthRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  measurePill: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  measurePillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  measurePillText: { color: colors.text, fontSize: type.caption, fontWeight: "700" },
  measurePillTextOn: { color: colors.primary },
  guide: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    alignItems: "center",
  },
  guideLine: {
    alignSelf: "stretch",
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.9,
  },
  levelBadge: {
    marginTop: spacing.xs,
    fontSize: type.caption,
    fontWeight: "800",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  levelOk: { backgroundColor: colors.success, color: "#FFFFFF" },
  levelWarn: { backgroundColor: colors.warning, color: "#000000" },
  qrOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  qrFrame: {
    width: 220,
    height: 220,
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: 16,
  },
  qrCancel: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 10,
  },
  treeChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  treeChipText: { color: colors.primary, fontSize: type.caption, fontWeight: "800" },
  clinoBtn: {
    width: 40,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  guideText: {
    marginTop: spacing.xs,
    color: "#FFFFFF",
    fontSize: type.caption,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  depthLabel: { color: colors.textDim, fontSize: type.caption, flex: 1 },
  input: {
    width: 110,
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    fontSize: type.body,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: "center",
  },
  actionRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch", marginTop: 2 },
  navBtn: {
    width: 50,
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  captureBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
    minHeight: 50,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  captureSecondary: { backgroundColor: colors.surfaceAlt },
  analyzeBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  buttonText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  analyzeText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  blockReason: { color: colors.warning, fontSize: type.caption, textAlign: "center" },
  heading: { color: colors.text, fontSize: type.title, fontWeight: "700", textAlign: "center" },
  hintCenter: { color: colors.textDim, fontSize: type.body, textAlign: "center" },
  button: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonSecondary: { backgroundColor: colors.surfaceAlt },
});
