import { BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  Check,
  ClipboardCheck,
  Flashlight,
  FlashlightOff,
  ImagePlus,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Ruler,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";

import {
  CapturedImage,
  CaptureShot,
  getScanCapabilities,
  HeightSource,
  ScanCapabilities,
  TreeMeasurements,
} from "../api/client";
import Clinometer from "../components/Clinometer";
import EdgeAdjuster, { Edges } from "../components/EdgeAdjuster";
import { dec } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Pill, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import { isDepthSensorAvailable, measureCenterDistance } from "../../modules/depth-sensor";
import { dbhFromEdges, isPlausibleDbh } from "../utils/dbh";
import {
  ALL_STEPS,
  codeSidePx,
  CORE_STEPS,
  DEFAULT_EDGES,
  DISTANCE_PRESETS,
  EXTRA_STEPS,
  plateDistanceFromPreview,
  previewFraction,
  REQUIRED_KEYS,
  ScanStep,
  stepByKey,
} from "../utils/scanFlow";
import { isLevel } from "../utils/tilt";
import { useDeviceTilt } from "../utils/useDeviceTilt";

const t = fr.capture;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GPS_TIMEOUT_MS = 20000;
const PLATE_FRESH_MS = 1500;
const TOAST_MS = 1800;
const REVIEW = "review";

type MeasureMode = "photo" | "tape" | "caliper";

function parseNum(text: string): number {
  return parseFloat(text.replace(",", "."));
}

/** 35 mm-equivalent focal from EXIF (iOS and Android spell it the same). */
export function exifFocal35mm(exif: Record<string, unknown> | null | undefined): number | undefined {
  const raw = exif?.FocalLenIn35mmFilm ?? exif?.FocalLengthIn35mmFilm;
  const value = typeof raw === "string" ? parseFloat(raw) : (raw as number | undefined);
  return typeof value === "number" && value > 0 ? value : undefined;
}

interface StepShot {
  image: CapturedImage;
  imported: boolean;
  focal35mm?: number;
}

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

function buzz() {
  if (Platform.OS === "android") Vibration.vibrate(12);
}

/** Next step after a capture: the first core photo still missing, else the review. */
function nextAfter(shots: Record<string, StepShot>, key: string): string {
  if (EXTRA_STEPS.some((s) => s.key === key)) return REVIEW;
  return CORE_STEPS.find((s) => !shots[s.key])?.key ?? REVIEW;
}

export default function CaptureScreen({ onCaptured, onBack }: Props) {
  const th = useTheme();
  const s = useStyles();
  const [permission, requestPermission] = useCameraPermissions();
  const [current, setCurrent] = useState<string>(CORE_STEPS[0].key);
  const [shots, setShots] = useState<Record<string, StepShot>>({});
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "ok" | "error">("waiting");
  const [caps, setCaps] = useState<ScanCapabilities>({ ai_segmentation: false, ai_distance: false });
  const [sensorAvailable, setSensorAvailable] = useState(false);
  const [sensorBusy, setSensorBusy] = useState(false);
  const [sensorNote, setSensorNote] = useState<string | null>(null);
  const [depthText, setDepthText] = useState("");
  const [depthSource, setDepthSource] = useState<"lidar" | "arcore" | undefined>(undefined);
  const [showOther, setShowOther] = useState(false);
  const [overrideAuto, setOverrideAuto] = useState(false);
  const [measureMode, setMeasureMode] = useState<MeasureMode>("photo");
  const [refText, setRefText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [heightSource, setHeightSource] = useState<HeightSource>("manual");
  const [heightEditing, setHeightEditing] = useState(false);
  const [clinoOpen, setClinoOpen] = useState(false);
  const [qrMode, setQrMode] = useState(false);
  const [treeCode, setTreeCode] = useState<string | null>(null);
  const [plateLive, setPlateLive] = useState<number | null>(null);
  const [plateOnDbh, setPlateOnDbh] = useState<{ distance: number | null } | null>(null);
  const [edges, setEdges] = useState<Edges>(DEFAULT_EDGES);
  const [edgesConfirmed, setEdgesConfirmed] = useState(false);
  const [dbhPhotoSize, setDbhPhotoSize] = useState<{ width: number; height: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [taking, setTaking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [toast, setToast] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const positionRef = useRef<{ lat: number; lon: number } | null>(null);
  const treeCodeRef = useRef<string | null>(null);
  const plateRef = useRef<{ at: number; distance: number | null } | null>(null);
  const plateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useRef(new Animated.Value(0)).current;

  const step: ScanStep | undefined = current === REVIEW ? undefined : stepByKey(current);
  const shot = step ? shots[step.key] : undefined;
  const cameraLive = qrMode || (!!step && !shot);

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
            if (last) setPos({ lat: last.coords.latitude, lon: last.coords.longitude });
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
    void isDepthSensorAvailable().then((ok) => alive && setSensorAvailable(ok));
    void getScanCapabilities().then((c) => alive && setCaps(c));
    return () => {
      alive = false;
      if (plateTimer.current) clearTimeout(plateTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const depth = parseNum(depthText);
  const reference = parseNum(refText);
  const height = parseNum(heightText);
  const dbhShot = shots.dbh;
  const dbhUri = dbhShot?.image.uri;
  const edgeDistance = depth > 0 ? depth : (plateOnDbh?.distance ?? null);

  const guiding = !!step && step.key === "dbh" && cameraLive && !qrMode;
  const tilt = useDeviceTilt(guiding);
  const level = isLevel(tilt.elevationDeg, tilt.rollDeg);

  useEffect(() => {
    setDbhPhotoSize(null);
    setEdges(DEFAULT_EDGES);
    setEdgesConfirmed(false);
    if (!dbhUri) return;
    Image.getSize(
      dbhUri,
      (width, h) => setDbhPhotoSize({ width, height: h }),
      () => setDbhPhotoSize(null),
    );
  }, [dbhUri]);

  const measureWithSensor = useCallback(async () => {
    setSensorBusy(true);
    setSensorNote(null);
    try {
      const reading = await measureCenterDistance();
      if (reading) {
        setDepthText(reading.distanceM.toFixed(2));
        setDepthSource(reading.source);
        setSensorNote(t.sensorUsed(reading.source));
      } else {
        setSensorNote(t.sensorFailed);
      }
    } finally {
      setSensorBusy(false);
    }
  }, []);

  const onBarcode = useCallback(
    (event: BarcodeScanningResult) => {
      const code = event.data?.trim();
      if (!code) return;
      const side = codeSidePx(event);
      const distance = side ? plateDistanceFromPreview(side, view.w, view.h) : null;
      plateRef.current = { at: Date.now(), distance };
      setPlateLive((prev) => (distance == null || prev == null || Math.abs(prev - distance) > 0.05 ? distance : prev));
      if (plateTimer.current) clearTimeout(plateTimer.current);
      plateTimer.current = setTimeout(() => setPlateLive(null), PLATE_FRESH_MS);
      if (code !== treeCodeRef.current) {
        treeCodeRef.current = code;
        setTreeCode(code);
        showToast(t.plateDetected(code));
        buzz();
      }
      setQrMode(false);
    },
    [view.w, view.h, showToast],
  );

  const unlinkTree = useCallback(() => {
    treeCodeRef.current = null;
    setTreeCode(null);
  }, []);

  const storeShot = useCallback(
    (key: string, value: StepShot) => {
      const next = { ...shots, [key]: value };
      setShots(next);
      buzz();
      flash.setValue(0.9);
      Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }).start();
      const st = stepByKey(key);
      if (key === "dbh") {
        const plate = plateRef.current;
        setPlateOnDbh(plate && Date.now() - plate.at < PLATE_FRESH_MS ? { distance: plate.distance } : null);
        if (sensorAvailable && !(depth > 0)) void measureWithSensor();
        return;
      }
      if (st) showToast(t.saved(st.short));
      setCurrent(nextAfter(next, key));
    },
    [shots, flash, sensorAvailable, depth, measureWithSensor, showToast],
  );

  const takePicture = useCallback(async () => {
    if (!cameraRef.current || taking || !step) return;
    setTaking(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, exif: true });
      if (!photo) return;
      storeShot(step.key, {
        image: { uri: photo.uri, name: `${step.key}.jpg`, type: "image/jpeg" },
        imported: false,
        focal35mm: exifFocal35mm(photo.exif as Record<string, unknown> | undefined),
      });
    } finally {
      setTaking(false);
    }
  }, [taking, step, storeShot]);

  const importPhoto = useCallback(async () => {
    if (importing || !step) return;
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
      storeShot(step.key, {
        image: { uri: asset.uri, name: asset.fileName ?? `${step.key}.jpg`, type: asset.mimeType ?? "image/jpeg" },
        imported: true,
        focal35mm: exifFocal35mm(asset.exif as Record<string, unknown> | null | undefined),
      });
    } finally {
      setImporting(false);
    }
  }, [importing, step, storeShot]);

  const retake = useCallback(() => {
    if (!step) return;
    const key = step.key;
    setShots((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
    if (key === "dbh") setPlateOnDbh(null);
  }, [step]);

  const confirmDbh = useCallback(() => {
    if (dbhUri) setEdgesConfirmed(true);
    setCurrent(nextAfter(shots, "dbh"));
  }, [dbhUri, shots]);

  const shotsTaken = Object.keys(shots).length > 0;
  const goBack = useCallback(() => {
    if (qrMode) {
      setQrMode(false);
      return;
    }
    if (!shotsTaken) {
      onBack();
      return;
    }
    Alert.alert(t.discardTitle, t.discardMsg, [
      { text: t.keepEditing, style: "cancel" },
      { text: t.discardYes, style: "destructive", onPress: onBack },
    ]);
  }, [qrMode, shotsTaken, onBack]);

  const missing = REQUIRED_KEYS.filter((k) => !shots[k]);
  const measureReady =
    measureMode === "photo" ? depth > 0 || plateOnDbh != null || caps.ai_distance : reference > 0;
  const blockReason = missing.length
    ? t.missingPhotos(missing.map((k) => stepByKey(k)?.short ?? k).join(", "))
    : !position
      ? t.needGps
      : !measureReady
        ? measureMode === "photo"
          ? t.needDistance
          : t.needMeasure
        : null;

  const submit = useCallback(() => {
    if (blockReason || !position || submitting) return;
    const captured: CaptureShot[] = ALL_STEPS.filter((st) => shots[st.key]).map((st) => ({
      image: shots[st.key].image,
      organ: st.organ,
      azimuth: st.azimuth,
      focal35mm: shots[st.key].focal35mm,
    }));
    setSubmitting(true);
    onCaptured({
      shots: captured,
      latitude: position.lat,
      longitude: position.lon,
      arDepthM: depth > 0 ? depth : undefined,
      circumferenceCm: measureMode === "tape" ? reference : undefined,
      caliperDbhCm: measureMode === "caliper" ? reference : undefined,
      measuredHeightM: height > 0 ? height : undefined,
      heightSource: height > 0 ? heightSource : undefined,
      treeCode: treeCode ?? undefined,
      depthSource: depth > 0 ? depthSource : undefined,
      edgeLeft: edgesConfirmed && dbhUri ? edges.left : undefined,
      edgeRight: edgesConfirmed && dbhUri ? edges.right : undefined,
    });
  }, [
    blockReason,
    position,
    submitting,
    shots,
    depth,
    measureMode,
    reference,
    height,
    heightSource,
    treeCode,
    depthSource,
    edges,
    edgesConfirmed,
    dbhUri,
    onCaptured,
  ]);

  const liveDbh = useMemo(() => {
    if (!dbhPhotoSize || !edgeDistance) return null;
    const cm = dbhFromEdges({
      ...edges,
      widthPx: dbhPhotoSize.width,
      heightPx: dbhPhotoSize.height,
      focal35mm: dbhShot?.focal35mm,
      distanceM: edgeDistance,
    });
    return isPlausibleDbh(cm) ? cm : null;
  }, [dbhPhotoSize, edgeDistance, edges, dbhShot?.focal35mm]);

  const onCameraLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setView({ w: width, h });
  };

  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={th.c.gold} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Txt variant="title">Scan</Txt>
        <Txt tone="muted" style={s.centerText}>
          {t.cameraDenied}
        </Txt>
        <Button testID="allow-camera-button" label={t.allowCamera} onPress={requestPermission} />
        <Button testID="back-button" label={t.back} variant="secondary" onPress={onBack} />
      </View>
    );
  }

  const coreIndex = step ? CORE_STEPS.findIndex((st) => st.key === step.key) : -1;
  const title = qrMode ? t.qrScan : step ? step.title : t.reviewTitle;
  const subtitle = qrMode
    ? t.qrHint
    : coreIndex >= 0
      ? t.stepOf(coreIndex + 1, CORE_STEPS.length)
      : step
        ? t.extrasTitle
        : t.railReview;
  const bracketLeft = previewFraction(DEFAULT_EDGES.left, view.w, view.h);
  const bracketRight = previewFraction(DEFAULT_EDGES.right, view.w, view.h);
  const autoDistance = depthSource != null || plateOnDbh != null;

  return (
    <View style={s.screen}>
      {/* Band: title + step rail */}
      <View style={s.band}>
        <View style={s.titleRow}>
          <Pressable
            testID="back-button"
            onPress={goBack}
            style={s.roundBtn}
            accessibilityRole="button"
            accessibilityLabel={t.back}
            hitSlop={6}
          >
            <X size={20} color={th.c.onForest} strokeWidth={2.4} />
          </Pressable>
          <View style={s.titles}>
            <Text style={s.eyebrow} numberOfLines={1}>
              {subtitle}
            </Text>
            <Text style={s.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {cameraLive ? (
            <Pressable
              testID="torch-toggle"
              onPress={() => setTorchOn((v) => !v)}
              style={[s.roundBtn, torchOn && s.roundBtnOn]}
              accessibilityRole="switch"
              accessibilityLabel="Lampe"
              accessibilityState={{ checked: torchOn }}
              hitSlop={6}
            >
              {torchOn ? (
                <Flashlight size={19} color="#1B2114" strokeWidth={2.2} />
              ) : (
                <FlashlightOff size={19} color={th.c.onForest} strokeWidth={2.2} />
              )}
            </Pressable>
          ) : (
            <View style={s.roundSpacer} />
          )}
        </View>
        <View style={s.rail}>
          {CORE_STEPS.map((st, i) => {
            const done = !!shots[st.key];
            const active = current === st.key;
            return (
              <Pressable
                key={st.key}
                testID={`rail-${st.key}`}
                onPress={() => {
                  setQrMode(false);
                  setCurrent(st.key);
                }}
                style={s.railItem}
                accessibilityRole="button"
                accessibilityLabel={st.title}
                accessibilityState={{ selected: active }}
              >
                <View style={[s.railDot, done && s.railDotDone, active && s.railDotActive]}>
                  {done ? (
                    <>
                      <Image source={{ uri: shots[st.key].image.uri }} style={s.railThumb} />
                      <View style={s.railCheck}>
                        <Check size={10} color="#FFFFFF" strokeWidth={3.5} />
                      </View>
                    </>
                  ) : (
                    <Text style={[s.railNum, active && s.railNumActive]}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[s.railLabel, active && s.railLabelActive]} numberOfLines={1}>
                  {st.short}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            testID="rail-review"
            onPress={() => {
              setQrMode(false);
              setCurrent(REVIEW);
            }}
            style={s.railItem}
            accessibilityRole="button"
            accessibilityLabel={t.reviewTitle}
            accessibilityState={{ selected: current === REVIEW }}
          >
            <View style={[s.railDot, current === REVIEW && s.railDotActive, !missing.length && s.railDotReady]}>
              <ClipboardCheck size={17} color={current === REVIEW ? th.c.gold : th.c.onForest} strokeWidth={2.2} />
            </View>
            <Text style={[s.railLabel, current === REVIEW && s.railLabelActive]} numberOfLines={1}>
              {t.railReview}
            </Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={s.body} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {(cameraLive && step) || qrMode ? (
          <View style={s.cameraWrap} onLayout={onCameraLayout}>
            <CameraView
              ref={cameraRef}
              style={s.fill}
              facing="back"
              flash="off"
              enableTorch={torchOn && cameraReady}
              onCameraReady={() => setCameraReady(true)}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={onBarcode}
            />

            {qrMode ? (
              <View style={s.qrOverlay} testID="qr-overlay" pointerEvents="box-none">
                <View style={s.qrFrame} pointerEvents="none" />
                <Text style={s.hintPill}>{t.qrHint}</Text>
                <Button testID="qr-cancel" label={t.qrCancel} variant="secondary" compact onPress={() => setQrMode(false)} />
              </View>
            ) : step ? (
              <>
                <FramingGuide frame={step.frame} left={bracketLeft} right={bracketRight} />
                {guiding ? (
                  <View style={s.dbhGuide} pointerEvents="none" testID="dbh-guide">
                    <Text style={s.guideTag}>1,30 m</Text>
                    {tilt.available ? (
                      <Text testID="level-indicator" style={[s.levelBadge, level ? s.levelOk : s.levelWarn]}>
                        {level ? t.level : t.levelFix(tilt.rollDeg, tilt.elevationDeg)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                <View style={s.chips} pointerEvents="box-none">
                  <GpsChip status={gpsStatus} onRetry={() => void locate(true)} />
                  {treeCode ? <TreeChip code={treeCode} onUnlink={unlinkTree} /> : null}
                  {guiding && plateLive != null ? (
                    <Text style={s.chipText} testID="plate-live">
                      {t.plateDistance(plateLive)}
                    </Text>
                  ) : null}
                </View>

                <View style={s.controls}>
                  <Text style={s.hintPill} numberOfLines={2}>
                    {step.hint}
                  </Text>
                  <View style={s.controlRow}>
                    <Pressable
                      testID="import-button"
                      style={s.sideBtn}
                      onPress={() => void importPhoto()}
                      disabled={importing}
                      accessibilityRole="button"
                      accessibilityLabel={t.importPhoto}
                    >
                      {importing ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <ImagePlus size={22} color="#FFFFFF" strokeWidth={2} />
                      )}
                    </Pressable>
                    <Pressable
                      testID="capture-button"
                      onPress={() => void takePicture()}
                      disabled={taking}
                      style={({ pressed }) => [s.shutter, pressed && s.shutterPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={step.title}
                    >
                      <View style={s.shutterInner}>{taking ? <ActivityIndicator color="#1B2114" /> : null}</View>
                    </Pressable>
                    {step.key === "dbh" || EXTRA_STEPS.some((x) => x.key === step.key) ? (
                      <Pressable
                        testID="skip-button"
                        style={s.sideBtn}
                        onPress={() => setCurrent(REVIEW)}
                        accessibilityRole="button"
                        accessibilityLabel={t.skip}
                      >
                        <Text style={s.sideText}>{t.skipDbh}</Text>
                      </Pressable>
                    ) : (
                      <View style={s.sideSpacer} />
                    )}
                  </View>
                </View>
              </>
            ) : null}
            <Animated.View pointerEvents="none" style={[s.fill, s.flash, { opacity: flash }]} />
          </View>
        ) : step && shot && step.key === "dbh" ? (
          <>
            <View style={s.adjustWrap}>
              {dbhPhotoSize ? (
                <EdgeAdjuster
                  uri={shot.image.uri}
                  widthPx={dbhPhotoSize.width}
                  heightPx={dbhPhotoSize.height}
                  focal35mm={shot.focal35mm}
                  distanceM={edgeDistance}
                  edges={edges}
                  onChange={setEdges}
                />
              ) : (
                <Image source={{ uri: shot.image.uri }} style={s.fill} resizeMode="contain" />
              )}
            </View>
            <View style={s.sheet} testID="dbh-panel">
              {measureMode === "photo" ? (
                <>
                  <View style={s.sheetHead}>
                    <Txt variant="label" tone="gold">
                      {t.distanceTitle}
                    </Txt>
                    {autoDistance && !overrideAuto ? (
                      <Pressable testID="distance-edit" onPress={() => setOverrideAuto(true)} hitSlop={8}>
                        <Txt variant="small" tone="olive" bold>
                          {t.heightEdit}
                        </Txt>
                      </Pressable>
                    ) : null}
                  </View>
                  {depthSource && !overrideAuto ? (
                    <Pill tone="ok" label={t.distanceSensor(depthSource, depth)} testID="distance-auto" />
                  ) : plateOnDbh && !overrideAuto && !(depth > 0) ? (
                    <Pill
                      tone="ok"
                      testID="distance-auto"
                      label={plateOnDbh.distance != null ? t.plateDistance(plateOnDbh.distance) : t.plateSeen}
                    />
                  ) : (
                    <View style={s.presetRow}>
                      {DISTANCE_PRESETS.map((m) => {
                        const on = !showOther && Math.abs(depth - m) < 1e-6;
                        return (
                          <Pressable
                            key={m}
                            testID={`distance-${m}`}
                            onPress={() => {
                              setDepthText(String(m));
                              setDepthSource(undefined);
                              setSensorNote(null);
                              setShowOther(false);
                            }}
                            style={[s.preset, on && s.presetOn]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                          >
                            <Text style={[s.presetText, on && s.presetTextOn]}>{t.distancePreset(m)}</Text>
                          </Pressable>
                        );
                      })}
                      {showOther ? (
                        <TextInput
                          testID="depth-input"
                          style={[s.preset, s.presetInput]}
                          value={depthText}
                          autoFocus
                          onChangeText={(text) => {
                            setDepthText(text);
                            setDepthSource(undefined);
                            setSensorNote(null);
                          }}
                          keyboardType="numeric"
                          placeholder="m"
                          placeholderTextColor={th.c.muted}
                        />
                      ) : (
                        <Pressable
                          testID="distance-other"
                          onPress={() => setShowOther(true)}
                          style={s.preset}
                          accessibilityRole="button"
                        >
                          <Text style={s.presetText}>{t.distanceOther}</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                  {caps.ai_distance && !autoDistance && !(depth > 0) ? (
                    <Txt variant="caption" tone="muted">
                      {t.distanceAi}
                    </Txt>
                  ) : null}
                  {sensorAvailable ? (
                    <View style={s.inlineRow}>
                      <Button
                        testID="sensor-button"
                        label={sensorBusy ? t.sensorBusy : t.sensorMeasure}
                        variant="secondary"
                        compact
                        disabled={sensorBusy}
                        onPress={() => void measureWithSensor()}
                      />
                      {sensorNote ? (
                        <Txt testID="sensor-note" variant="caption" tone="muted" style={s.flex}>
                          {sensorNote}
                        </Txt>
                      ) : null}
                    </View>
                  ) : null}
                  <Pressable testID="reference-toggle" onPress={() => setMeasureMode("tape")} hitSlop={6}>
                    <Txt variant="small" tone="olive" bold>
                      {t.referenceToggle}
                    </Txt>
                  </Pressable>
                </>
              ) : (
                <ReferenceForm
                  mode={measureMode}
                  value={refText}
                  onMode={setMeasureMode}
                  onChange={setRefText}
                />
              )}
              <View style={s.actionRow}>
                <Button
                  testID="retake-button"
                  label={t.retake}
                  variant="secondary"
                  onPress={retake}
                  icon={<RotateCcw size={17} color={th.c.olive} />}
                  style={s.flex}
                />
                <Button
                  testID="dbh-confirm"
                  label={t.dbhConfirm}
                  onPress={confirmDbh}
                  icon={<Check size={18} color={th.c.onOlive} strokeWidth={2.6} />}
                  style={s.flex}
                />
              </View>
            </View>
          </>
        ) : step && shot ? (
          <>
            <View style={s.adjustWrap}>
              <Image source={{ uri: shot.image.uri }} style={s.fill} resizeMode="contain" />
              {shot.imported ? (
                <View style={s.importBadge}>
                  <Pill tone="info" label={t.imported} />
                </View>
              ) : null}
            </View>
            <View style={[s.sheet, s.actionRow]}>
              <Button
                testID="retake-button"
                label={t.retake}
                variant="secondary"
                onPress={retake}
                icon={<RotateCcw size={17} color={th.c.olive} />}
                style={s.flex}
              />
              <Button
                testID="continue-button"
                label={t.continue}
                onPress={() => setCurrent(nextAfter(shots, step.key))}
                style={s.flex}
              />
            </View>
          </>
        ) : (
          <Review
            shots={shots}
            liveDbh={edgesConfirmed ? liveDbh : null}
            measureMode={measureMode}
            reference={reference}
            heightText={heightText}
            heightSource={heightSource}
            heightEditing={heightEditing}
            onHeightEdit={() => setHeightEditing(true)}
            onHeightChange={(text) => {
              setHeightText(text);
              setHeightSource("manual");
            }}
            onClinometer={() => setClinoOpen(true)}
            treeCode={treeCode}
            onUnlink={unlinkTree}
            onScanQr={() => setQrMode(true)}
            gpsStatus={gpsStatus}
            position={position}
            onRetryGps={() => void locate(true)}
            caps={caps}
            onOpenStep={setCurrent}
            blockReason={blockReason}
            submitting={submitting}
            onSubmit={submit}
          />
        )}

        {toast ? (
          <View style={s.toastWrap} pointerEvents="none">
            <Text style={s.toast} testID="toast">
              {toast}
            </Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <Clinometer
        visible={clinoOpen}
        initialDistanceM={depth > 0 ? depth : undefined}
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

/** Framing marks on the live camera, per step. */
function FramingGuide({ frame, left, right }: { frame: ScanStep["frame"]; left: number; right: number }) {
  const s = useStyles();
  if (frame === "dbh") {
    return (
      <View style={s.fill} pointerEvents="none">
        <View style={[s.bracket, { left: `${left * 100}%` }]} />
        <View style={[s.bracket, { left: `${right * 100}%` }]} />
        <View style={s.breastLine} />
      </View>
    );
  }
  const box = frame === "tall" ? s.frameTall : s.frameSquare;
  return (
    <View style={[s.fill, s.frameCenter]} pointerEvents="none">
      <View style={box}>
        <View style={[s.corner, s.cTL]} />
        <View style={[s.corner, s.cTR]} />
        <View style={[s.corner, s.cBL]} />
        <View style={[s.corner, s.cBR]} />
      </View>
    </View>
  );
}

function GpsChip({ status, onRetry }: { status: "waiting" | "ok" | "error"; onRetry: () => void }) {
  const s = useStyles();
  const th = useTheme();
  const color = status === "ok" ? th.c.ok : status === "waiting" ? th.c.warn : th.c.risk;
  const label = status === "ok" ? t.gpsOk : status === "waiting" ? t.gpsWaiting : t.gpsUnavailable;
  return (
    <View style={s.chip} testID="gps-chip">
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.chipLabel}>{label}</Text>
      {status === "error" ? (
        <Pressable testID="retry-gps-button" onPress={onRetry} hitSlop={8}>
          <Text style={s.chipAction}>{t.retry}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TreeChip({ code, onUnlink }: { code: string; onUnlink: () => void }) {
  const s = useStyles();
  return (
    <View style={[s.chip, s.chipGold]} testID="tree-chip">
      <QrCode size={13} color="#1B2114" strokeWidth={2.4} />
      <Text style={[s.chipLabel, s.chipLabelDark]} numberOfLines={1}>
        {t.treeLinked(code)}
      </Text>
      <Pressable testID="tree-unlink" onPress={onUnlink} hitSlop={8} accessibilityLabel={t.unlinkTree}>
        <X size={14} color="#1B2114" strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

function ReferenceForm({
  mode,
  value,
  onMode,
  onChange,
}: {
  mode: MeasureMode;
  value: string;
  onMode: (m: MeasureMode) => void;
  onChange: (text: string) => void;
}) {
  const s = useStyles();
  const th = useTheme();
  return (
    <>
      <View style={s.presetRow}>
        {(["tape", "caliper"] as const).map((m) => (
          <Pressable
            key={m}
            testID={`measure-${m}`}
            onPress={() => onMode(m)}
            style={[s.preset, s.flex, mode === m && s.presetOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
          >
            <Text style={[s.presetText, mode === m && s.presetTextOn]}>{m === "tape" ? t.modeTape : t.modeCaliper}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.inlineRow}>
        <Txt variant="small" tone="muted" style={s.flex}>
          {mode === "tape" ? t.tapeLabel : t.caliperLabel}
        </Txt>
        <TextInput
          testID="reference-input"
          style={[s.preset, s.presetInput]}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder={mode === "tape" ? "190" : "60"}
          placeholderTextColor={th.c.muted}
        />
      </View>
      <Pressable testID="reference-toggle" onPress={() => onMode("photo")} hitSlop={6}>
        <Txt variant="small" tone="olive" bold>
          {t.referenceHide}
        </Txt>
      </Pressable>
    </>
  );
}

function Review(props: {
  shots: Record<string, StepShot>;
  liveDbh: number | null;
  measureMode: MeasureMode;
  reference: number;
  heightText: string;
  heightSource: HeightSource;
  heightEditing: boolean;
  onHeightEdit: () => void;
  onHeightChange: (text: string) => void;
  onClinometer: () => void;
  treeCode: string | null;
  onUnlink: () => void;
  onScanQr: () => void;
  gpsStatus: "waiting" | "ok" | "error";
  position: { lat: number; lon: number } | null;
  onRetryGps: () => void;
  caps: ScanCapabilities;
  onOpenStep: (key: string) => void;
  blockReason: string | null;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const s = useStyles();
  const th = useTheme();
  const { shots, measureMode, reference } = props;
  const height = parseNum(props.heightText);
  const dbhText =
    measureMode === "tape" && reference > 0
      ? t.dbhTape(reference)
      : measureMode === "caliper" && reference > 0
        ? t.dbhCaliper(reference)
        : props.liveDbh != null
          ? t.edgesDbh(props.liveDbh)
          : shots.dbh
            ? t.dbhServer
            : t.dbhNone;

  return (
    <View style={s.flex} testID="review">
      <ScrollView contentContainerStyle={s.review} keyboardShouldPersistTaps="handled">
        <Txt variant="label" tone="gold">
          {t.photosTitle}
        </Txt>
        <View style={s.tiles}>
          {CORE_STEPS.map((st) => {
            const sh = shots[st.key];
            const required = REQUIRED_KEYS.includes(st.key);
            return (
              <Pressable
                key={st.key}
                testID={`tile-${st.key}`}
                onPress={() => props.onOpenStep(st.key)}
                style={[s.tile, !sh && required && s.tileMissing]}
                accessibilityRole="button"
                accessibilityLabel={st.title}
              >
                {sh ? (
                  <Image source={{ uri: sh.image.uri }} style={s.tileImg} />
                ) : (
                  <Plus size={22} color={required ? th.c.warn : th.c.muted} />
                )}
                <Text style={s.tileLabel} numberOfLines={1}>
                  {st.short}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Txt variant="label" tone="gold">
          {t.measureTitle}
        </Txt>
        <View style={s.panel}>
          <View style={s.row}>
            <View style={s.flex}>
              <Txt variant="caption" tone="muted">
                {t.dbhRow}
              </Txt>
              <Txt bold testID="review-dbh">
                {dbhText}
              </Txt>
            </View>
            <Button label={shots.dbh ? t.heightEdit : t.railDbh} variant="secondary" compact onPress={() => props.onOpenStep("dbh")} />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <View style={s.flex}>
              <Txt variant="caption" tone="muted">
                {t.heightTitle}
              </Txt>
              {props.heightEditing ? (
                <TextInput
                  testID="height-input"
                  style={[s.preset, s.presetInput, s.heightInput]}
                  value={props.heightText}
                  onChangeText={props.onHeightChange}
                  keyboardType="numeric"
                  placeholder="m"
                  placeholderTextColor={th.c.muted}
                />
              ) : (
                <Txt bold={height > 0} tone={height > 0 ? "ink" : "muted"} testID="review-height">
                  {height > 0 ? t.heightValue(height, props.heightSource === "clinometer") : t.heightNone}
                </Txt>
              )}
            </View>
            {!props.heightEditing ? (
              <Pressable testID="height-edit" onPress={props.onHeightEdit} style={s.iconBtn} accessibilityLabel={t.heightEdit}>
                <Pencil size={16} color={th.c.olive} />
              </Pressable>
            ) : null}
            <Button
              testID="clinometer-button"
              label={t.heightMeasure}
              accessibilityLabel={t.clinometer}
              variant="secondary"
              compact
              onPress={props.onClinometer}
              icon={<Ruler size={16} color={th.c.olive} />}
            />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <View style={s.flex}>
              <Txt variant="caption" tone="muted">
                {t.treeTitle}
              </Txt>
              {props.treeCode ? (
                <TreeChip code={props.treeCode} onUnlink={props.onUnlink} />
              ) : (
                <Txt tone="muted">{t.treeNone}</Txt>
              )}
            </View>
            {!props.treeCode ? (
              <Button
                testID="qr-button"
                label={t.treeScan}
                accessibilityLabel={t.qrScan}
                variant="secondary"
                compact
                onPress={props.onScanQr}
                icon={<QrCode size={16} color={th.c.olive} />}
              />
            ) : null}
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <View style={s.flex}>
              <Txt variant="caption" tone="muted">
                {t.gpsTitle}
              </Txt>
              <Txt tone={props.gpsStatus === "ok" ? "ok" : "warn"} testID="review-gps">
                {props.gpsStatus === "ok" && props.position
                  ? `${t.gpsOk} · ${dec(props.position.lat, 4)}, ${dec(props.position.lon, 4)}`
                  : props.gpsStatus === "waiting"
                    ? t.gpsWaiting
                    : t.gpsUnavailable}
              </Txt>
            </View>
            {props.gpsStatus === "error" ? (
              <Button testID="retry-gps-button" label={t.retry} variant="secondary" compact onPress={props.onRetryGps} />
            ) : null}
          </View>
        </View>

        <Txt variant="label" tone="gold">
          {t.extrasTitle}
        </Txt>
        <Txt variant="caption" tone="muted">
          {t.extrasHint}
        </Txt>
        <View style={s.extras}>
          {EXTRA_STEPS.map((st) => {
            const done = !!shots[st.key];
            return (
              <Pressable
                key={st.key}
                testID={`extra-${st.key}`}
                onPress={() => props.onOpenStep(st.key)}
                style={[s.extra, done && s.extraDone]}
                accessibilityRole="button"
                accessibilityState={{ selected: done }}
              >
                {done ? <Check size={14} color={th.c.ok} strokeWidth={3} /> : <Plus size={14} color={th.c.muted} />}
                <Text style={[s.extraText, done && s.extraTextDone]}>{st.short}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text
          testID="ai-status"
          style={[s.aiStatus, props.caps.ai_segmentation ? s.aiOn : null]}
          numberOfLines={2}
        >
          {props.caps.ai_segmentation
            ? t.aiOn
            : props.caps.offline
              ? t.aiOffline
              : props.caps.ai_off_reason === "memory"
                ? t.aiOffMemory
                : t.aiOffDisabled}
        </Text>
      </ScrollView>
      <View style={s.footer}>
        {props.blockReason ? (
          <Txt variant="small" tone="warn" style={s.centerText} testID="block-reason">
            {props.blockReason}
          </Txt>
        ) : null}
        <Button
          testID="analyze-button"
          label={t.analyze}
          onPress={props.onSubmit}
          disabled={props.blockReason != null}
          loading={props.submitting}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  center: {
    flex: 1,
    backgroundColor: th.c.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: th.space.xl,
    gap: th.space.lg,
  },
  centerText: { textAlign: "center" },
  band: { backgroundColor: th.c.forest, paddingBottom: th.space.sm },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.md,
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.xs,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(217,180,74,0.45)",
  },
  roundBtnOn: { backgroundColor: th.c.gold, borderColor: th.c.gold },
  roundSpacer: { width: 40 },
  titles: { flex: 1, minWidth: 0, alignItems: "center" },
  eyebrow: {
    color: th.c.gold,
    fontFamily: th.fonts.displaySemi,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: { color: th.c.onForest, fontFamily: th.fonts.display, fontSize: 19, lineHeight: 23 },
  rail: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.sm,
  },
  railItem: { alignItems: "center", gap: 3, minWidth: 56 },
  railDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: "rgba(237,240,230,0.35)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  railDotDone: { borderColor: th.c.ok },
  railDotActive: { borderColor: th.c.gold, borderWidth: 2.5 },
  railDotReady: { borderColor: th.c.ok },
  railThumb: { width: 32, height: 32, borderRadius: 16 },
  railCheck: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: th.c.ok,
    alignItems: "center",
    justifyContent: "center",
  },
  railNum: { color: th.c.onForest, fontFamily: th.fonts.display, fontSize: 15, opacity: 0.8 },
  railNumActive: { color: th.c.gold, opacity: 1 },
  railLabel: { color: th.c.onForest, opacity: 0.75, fontFamily: th.fonts.body, fontSize: 11 },
  railLabelActive: { color: th.c.gold, opacity: 1, fontFamily: th.fonts.bodyBold },
  body: { flex: 1, backgroundColor: th.c.bg },
  cameraWrap: { flex: 1, backgroundColor: "#000", overflow: "hidden" },
  flash: { backgroundColor: "#FFFFFF" },
  chips: {
    position: "absolute",
    top: th.space.md,
    left: th.space.md,
    right: th.space.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: th.space.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: th.radius.pill,
    paddingHorizontal: 10,
    minHeight: 30,
    maxWidth: "100%",
  },
  chipGold: { backgroundColor: th.c.gold, alignSelf: "flex-start" },
  chipLabel: { color: "#FFFFFF", fontFamily: th.fonts.bodyBold, fontSize: 12.5, flexShrink: 1 },
  chipLabelDark: { color: "#1B2114" },
  chipAction: { color: th.c.gold, fontFamily: th.fonts.bodyBold, fontSize: 12.5 },
  chipText: {
    color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: th.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: th.fonts.bodyBold,
    fontSize: 12.5,
    overflow: "hidden",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  frameCenter: { alignItems: "center", justifyContent: "center", paddingBottom: 150 },
  frameTall: { width: "70%", height: "72%" },
  frameSquare: { width: "68%", aspectRatio: 1 },
  corner: { position: "absolute", width: 28, height: 28, borderColor: th.c.gold },
  cTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  bracket: {
    position: "absolute",
    top: "18%",
    bottom: "30%",
    width: 3,
    marginLeft: -1.5,
    backgroundColor: th.c.gold,
    opacity: 0.9,
    borderRadius: 2,
  },
  breastLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "44%",
    height: 2,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  dbhGuide: { position: "absolute", left: 0, right: 0, top: "44%", alignItems: "center", gap: th.space.xs },
  guideTag: {
    marginTop: 4,
    color: "#1B2114",
    backgroundColor: th.c.gold,
    fontFamily: th.fonts.display,
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  levelBadge: {
    fontSize: 12.5,
    fontFamily: th.fonts.bodyBold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: th.radius.pill,
    overflow: "hidden",
  },
  levelOk: { backgroundColor: th.c.ok, color: "#0F130C" },
  levelWarn: { backgroundColor: th.c.warn, color: "#0F130C" },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: th.space.md,
    paddingBottom: th.space.lg,
    paddingHorizontal: th.space.lg,
    backgroundColor: "rgba(0,0,0,0.45)",
    gap: th.space.md,
    alignItems: "center",
  },
  hintPill: {
    color: "#FFFFFF",
    fontFamily: th.fonts.body,
    fontSize: 13.5,
    textAlign: "center",
    paddingHorizontal: th.space.md,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
  },
  sideBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  sideSpacer: { width: 56 },
  sideText: { color: "#FFFFFF", fontFamily: th.fonts.bodyBold, fontSize: 13 },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: th.c.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterPressed: { transform: [{ scale: 0.94 }] },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  qrOverlay: { ...{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, alignItems: "center", justifyContent: "center", gap: th.space.lg },
  qrFrame: { width: 230, height: 230, borderWidth: 3, borderColor: th.c.gold, borderRadius: 18 },
  adjustWrap: { flex: 1, backgroundColor: "#000" },
  importBadge: { position: "absolute", left: th.space.md, top: th.space.md },
  sheet: {
    backgroundColor: th.c.surface,
    borderTopWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.md,
    paddingBottom: th.space.lg,
    gap: th.space.sm,
  },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  presetRow: { flexDirection: "row", gap: th.space.sm, flexWrap: "wrap" },
  preset: {
    minHeight: 44,
    minWidth: 60,
    paddingHorizontal: th.space.md,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  presetOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  presetText: { color: th.c.ink, fontFamily: th.fonts.bodyBold, fontSize: 15 },
  presetTextOn: { color: th.c.onOlive },
  presetInput: { color: th.c.ink, fontFamily: th.fonts.bodyBold, fontSize: 15, textAlign: "center", width: 80 },
  heightInput: { marginTop: 4, alignSelf: "flex-start" },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  actionRow: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.xs },
  review: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xl },
  tiles: { flexDirection: "row", gap: th.space.sm },
  tile: {
    flex: 1,
    aspectRatio: 0.8,
    borderRadius: th.radius.md,
    backgroundColor: th.c.surface,
    borderWidth: 1,
    borderColor: th.c.line,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tileMissing: { borderColor: th.c.warn, borderStyle: "dashed" },
  tileImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  tileLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.55)",
    fontFamily: th.fonts.bodyBold,
    fontSize: 11.5,
    paddingVertical: 3,
  },
  panel: {
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.sm },
  divider: { height: 1, backgroundColor: th.c.line },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  extras: { flexDirection: "row", flexWrap: "wrap", gap: th.space.sm },
  extra: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: th.space.md,
    borderRadius: th.radius.pill,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface,
  },
  extraDone: { borderColor: th.c.ok, backgroundColor: th.c.okSoft },
  extraText: { color: th.c.ink, fontFamily: th.fonts.body, fontSize: 13.5 },
  extraTextDone: { fontFamily: th.fonts.bodyBold },
  aiStatus: { color: th.c.muted, fontFamily: th.fonts.body, fontSize: 12, marginTop: th.space.sm },
  aiOn: { color: th.c.ok },
  footer: {
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.sm,
    paddingBottom: th.space.lg,
    gap: th.space.sm,
    backgroundColor: th.c.surface,
    borderTopWidth: 1,
    borderColor: th.c.line,
  },
  toastWrap: { position: "absolute", top: th.space.xxl + th.space.lg, left: 0, right: 0, alignItems: "center" },
  toast: {
    color: "#1B2114",
    backgroundColor: th.c.gold,
    fontFamily: th.fonts.bodyBold,
    fontSize: 14,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    borderRadius: th.radius.pill,
    overflow: "hidden",
  },
}));
