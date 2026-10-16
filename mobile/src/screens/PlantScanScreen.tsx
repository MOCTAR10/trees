import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { ChevronLeft, Leaf } from "lucide-react-native";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";

import { identifyPlant, PlantIdentification, PlantOrgan } from "../api/client";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.plant;
const ORGANS: PlantOrgan[] = ["leaf", "flower", "fruit", "bark", "whole"];
const MAX_PHOTOS = 5;

interface Props {
  onBack: () => void;
  onTreeMode: () => void;
}

type Photo = { uri: string; organ: PlantOrgan };

export default function PlantScanScreen({ onBack, onTreeMode }: Props) {
  const th = useTheme();
  const s = useStyles();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [organ, setOrgan] = useState<PlantOrgan>("leaf");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlantIdentification | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shoot = async () => {
    if (!cameraRef.current || photos.length >= MAX_PHOTOS) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) setPhotos((prev) => [...prev, { uri: photo.uri, organ }]);
    } catch {
      setError(t.failed);
    }
  };

  const identify = async () => {
    if (!photos.length) return;
    setBusy(true);
    setError(null);
    let coords: { latitude: number; longitude: number } | undefined;
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) coords = { latitude: last.coords.latitude, longitude: last.coords.longitude };
    } catch {
      coords = undefined;
    }
    try {
      setResult(await identifyPlant({ photos, ...coords }));
    } catch (err) {
      setError(String(err).includes("503") ? t.unavailable : t.failed);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setPhotos([]);
    setResult(null);
    setError(null);
  };

  const header = (
    <View style={s.header}>
      <Pressable onPress={onBack} style={s.round} accessibilityRole="button" accessibilityLabel={fr.capture.back} hitSlop={6}>
        <ChevronLeft size={20} color={th.c.onForest} />
      </Pressable>
      <Text style={s.title}>{t.title}</Text>
      <View style={s.round} />
    </View>
  );

  const modes = (
    <View style={s.modes} testID="scan-modes">
      <Pressable testID="mode-tree" onPress={onTreeMode} style={s.mode} accessibilityRole="button">
        <Text style={s.modeText}>{t.modeTree}</Text>
      </Pressable>
      <View style={[s.mode, s.modeOn]} accessibilityState={{ selected: true }}>
        <Leaf size={14} color="#1B2114" />
        <Text style={[s.modeText, s.modeTextOn]}>{t.modePlant}</Text>
      </View>
    </View>
  );

  if (result) {
    const [best, ...rest] = result.candidates;
    const others = rest.filter((c) => c.combined >= 0.01);
    return (
      <View style={s.screen} testID="plant-result">
        {header}
        <ScrollView contentContainerStyle={s.content}>
          {best ? (
            <View style={s.card}>
              <Text style={s.label}>{t.best}</Text>
              <Text style={s.species}>{best.scientific_name}</Text>
              {best.common_name_fr ? <Text style={s.common}>{best.common_name_fr}</Text> : null}
              <Text style={s.score}>{t.confidence(best.combined)}</Text>
              {!result.scientific_name ? <Text style={s.warn}>{t.uncertain}</Text> : null}
            </View>
          ) : (
            <Text style={s.warn}>{t.uncertain}</Text>
          )}
          {others.length ? (
            <View style={s.card}>
              <Text style={s.label}>{t.others}</Text>
              {others.map((c) => (
                <View key={c.scientific_name} style={s.row}>
                  <Text style={s.other}>{c.scientific_name}</Text>
                  <Text style={s.otherScore}>{t.confidence(c.combined)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={s.note}>{t.note}</Text>
          <Button testID="plant-again" label={t.again} onPress={restart} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.screen} testID="plant-scan">
      {header}
      {modes}
      {!permission?.granted ? (
        <View style={s.center}>
          <Text style={s.hint}>{t.noCamera}</Text>
          <Button label={t.allowCamera} onPress={() => void requestPermission()} />
        </View>
      ) : (
        <View style={s.cameraWrap}>
          <CameraView ref={cameraRef} style={s.fill} facing="back" />
          <Text style={s.hintPill}>{t.hint}</Text>
        </View>
      )}
      <View style={s.bottom}>
        <ScrollView horizontal contentContainerStyle={s.organs} showsHorizontalScrollIndicator={false}>
          {ORGANS.map((o) => (
            <Pressable
              key={o}
              testID={`organ-${o}`}
              onPress={() => setOrgan(o)}
              style={[s.organ, organ === o && s.organOn]}
              accessibilityState={{ selected: organ === o }}
            >
              <Text style={[s.organText, organ === o && s.organTextOn]}>{t.organs[o]}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {photos.length ? (
          <View style={s.thumbs}>
            {photos.map((p, i) => (
              <Pressable
                key={`${p.uri}-${i}`}
                onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                accessibilityLabel={`${t.remove} ${t.organs[p.organ]}`}
              >
                <Image source={{ uri: p.uri }} style={s.thumb} />
                <Text style={s.thumbLabel}>{t.organs[p.organ]}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={s.actions}>
          <Button
            testID="plant-shoot"
            label={`${t.shoot} · ${t.photos(photos.length)}`}
            variant="secondary"
            onPress={() => void shoot()}
            disabled={!permission?.granted || photos.length >= MAX_PHOTOS || busy}
          />
          {busy ? (
            <View style={s.busy}>
              <ActivityIndicator color={th.c.gold} />
              <Text style={s.hint}>{t.identifying}</Text>
            </View>
          ) : (
            <Button testID="plant-identify" label={t.identify} onPress={() => void identify()} disabled={!photos.length} />
          )}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.forest },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: th.space.md },
  title: { color: th.c.onForest, fontFamily: th.fonts.display, fontSize: 20 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  modes: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    padding: 3,
    marginBottom: th.space.sm,
  },
  mode: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 7, borderRadius: 999 },
  modeOn: { backgroundColor: th.c.gold },
  modeText: { color: th.c.onForest, fontFamily: th.fonts.bodyBold, fontSize: 14 },
  modeTextOn: { color: "#1B2114" },
  cameraWrap: { flex: 1, marginHorizontal: th.space.md, borderRadius: th.radius.lg, overflow: "hidden" },
  fill: { flex: 1 },
  hintPill: {
    position: "absolute",
    left: th.space.md,
    right: th.space.md,
    bottom: th.space.md,
    textAlign: "center",
    color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    padding: th.space.sm,
    fontFamily: th.fonts.body,
    fontSize: 13,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.md, padding: th.space.xl },
  hint: { color: th.c.onForest, fontFamily: th.fonts.body, fontSize: 14, textAlign: "center" },
  bottom: { padding: th.space.md, gap: th.space.sm },
  organs: { gap: th.space.xs },
  organ: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  organOn: { backgroundColor: th.c.gold, borderColor: th.c.gold },
  organText: { color: th.c.onForest, fontFamily: th.fonts.bodyBold, fontSize: 13 },
  organTextOn: { color: "#1B2114" },
  thumbs: { flexDirection: "row", gap: th.space.xs },
  thumb: { width: 54, height: 54, borderRadius: 8 },
  thumbLabel: { color: th.c.onForest, fontSize: 10, fontFamily: th.fonts.body, textAlign: "center" },
  error: { color: "#F2B8B5", fontFamily: th.fonts.bodyBold, fontSize: 13 },
  actions: { gap: th.space.sm },
  busy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: th.space.sm, minHeight: 48 },
  content: { padding: th.space.lg, gap: th.space.md },
  card: { backgroundColor: th.c.surface, borderRadius: th.radius.lg, padding: th.space.lg, gap: 4 },
  label: { color: th.c.goldInk, fontFamily: th.fonts.displaySemi, fontSize: 13, letterSpacing: 1 },
  species: { color: th.c.ink, fontFamily: th.fonts.bodyBold, fontSize: 22, fontStyle: "italic" },
  common: { color: th.c.muted, fontFamily: th.fonts.body, fontSize: 15 },
  score: { color: th.c.ok, fontFamily: th.fonts.display, fontSize: 28 },
  warn: { color: th.c.warn, fontFamily: th.fonts.bodyBold, fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  other: { color: th.c.ink, fontFamily: th.fonts.body, fontSize: 15, fontStyle: "italic", flex: 1 },
  otherScore: { color: th.c.muted, fontFamily: th.fonts.bodyBold, fontSize: 15 },
  note: { color: th.c.onForest, fontFamily: th.fonts.body, fontSize: 13, textAlign: "center" },
}));
