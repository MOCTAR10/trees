import React from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { LongPressEvent, Marker, Polygon, Region, UrlTile } from "react-native-maps";

import {
  checkMapPoint,
  ForestChecks,
  getMapLayers,
  getMapTiles,
  getNationalContext,
  listGroupTrees,
  listMyTrees,
  MapLayers,
  MapTileLayer,
  MyTree,
  NationalContext,
} from "../api/client";
import ForestChecksCard, { VERDICT_COLORS } from "../components/ForestChecksCard";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";
import { compactFr, toPolygons } from "../utils/geojson";

type Mode = "mine" | "group";

type MapTree = MyTree & { owner_name?: string | null };

const t = fr.map;

const DEFAULT_REGION: Region = {
  latitude: -0.7,
  longitude: 11.6,
  latitudeDelta: 6,
  longitudeDelta: 6,
};

const MAX_MARKERS = 150;

/** Stroke / fill per vector layer. */
const LAYER_STYLE: Record<string, { stroke: string; fill: string }> = {
  aac: { stroke: "#D4A017", fill: "rgba(212,160,23,0.18)" },
  protected_areas: { stroke: "#2E9E5B", fill: "rgba(46,158,91,0.20)" },
  logging_concessions: { stroke: "#B5651D", fill: "rgba(181,101,29,0.15)" },
  mining_concessions: { stroke: "#7E57C2", fill: "rgba(126,87,194,0.15)" },
};

const mapCache = new Map<Mode, MapTree[]>();

function regionFor(rows: MapTree[]): Region {
  if (rows.length === 0) return DEFAULT_REGION;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const tr of rows) {
    const lat = tr.latitude as number;
    const lon = tr.longitude as number;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.05, (maxLat - minLat) * 1.6 + 0.02),
    longitudeDelta: Math.max(0.05, (maxLon - minLon) * 1.6 + 0.02),
  };
}

type PointState =
  | { status: "loading"; lat: number; lon: number }
  | { status: "done"; lat: number; lon: number; checks: ForestChecks }
  | { status: "off" | "error"; lat: number; lon: number };

export default function MapScreen() {
  const [mode, setMode] = React.useState<Mode>("mine");
  const [trees, setTrees] = React.useState<MapTree[]>(() => mapCache.get("mine") ?? []);
  const [loading, setLoading] = React.useState(() => !mapCache.has("mine"));
  const [error, setError] = React.useState<string | null>(null);
  const [tiles, setTiles] = React.useState<MapTileLayer[]>([]);
  const [layers, setLayers] = React.useState<MapLayers | null>(null);
  const [enabled, setEnabled] = React.useState<Set<string>>(() => new Set(["aac"]));
  const [context, setContext] = React.useState<NationalContext | null>(null);
  const [contextOpen, setContextOpen] = React.useState(false);
  const [point, setPoint] = React.useState<PointState | null>(null);
  const mapRef = React.useRef<MapView>(null);

  const load = React.useCallback(async (m: Mode) => {
    const cached = mapCache.get(m);
    if (cached) {
      setTrees(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const rows: MapTree[] = m === "mine" ? await listMyTrees(200) : await listGroupTrees(500);
      const geo = rows.filter((tr) => tr.latitude != null && tr.longitude != null);
      mapCache.set(m, geo);
      setTrees(geo);
    } catch (err) {
      console.error("map trees failed", err);
      if (!mapCache.has(m)) setError(t.error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(mode);
  }, [load, mode]);

  React.useEffect(() => {
    void getMapTiles().then(setTiles).catch(() => setTiles([]));
    void getMapLayers().then(setLayers).catch(() => setLayers(null));
  }, []);

  React.useEffect(() => {
    if (trees.length > 0) mapRef.current?.animateToRegion(regionFor(trees), 400);
  }, [trees]);

  const toggle = (key: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const openContext = async () => {
    setContextOpen(true);
    if (!context) {
      try {
        setContext(await getNationalContext());
      } catch (err) {
        console.error("national context failed", err);
      }
    }
  };

  const onLongPress = async (e: LongPressEvent) => {
    const { latitude: lat, longitude: lon } = e.nativeEvent.coordinate;
    setPoint({ status: "loading", lat, lon });
    try {
      const checks = await checkMapPoint(lat, lon);
      setPoint(checks ? { status: "done", lat, lon, checks } : { status: "off", lat, lon });
    } catch (err) {
      console.error("point check failed", err);
      setPoint({ status: "error", lat, lon });
    }
  };

  const visible = React.useMemo(() => trees.slice(0, MAX_MARKERS), [trees]);
  const hiddenCount = trees.length - visible.length;
  const chips = [
    ...tiles.map((tl) => ({ key: tl.key, label: tl.label })),
    ...Object.keys(layers?.layers ?? {}).map((key) => ({
      key,
      label: layers?.labels[key] ?? key,
    })),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        {(["mine", "group"] as Mode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.segBtn, mode === m && styles.segBtnOn]}
            onPress={() => setMode(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
          >
            <Text style={[styles.segText, mode === m && styles.segTextOn]}>
              {m === "mine" ? t.mine : t.group}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          testID="context-button"
          style={styles.segBtn}
          onPress={() => void openContext()}
        >
          <Text style={styles.segText}>{t.context}</Text>
        </TouchableOpacity>
      </View>

      {chips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
        >
          {chips.map((c) => (
            <TouchableOpacity
              key={c.key}
              testID={`layer-${c.key}`}
              style={[styles.chip, enabled.has(c.key) && styles.chipOn]}
              onPress={() => toggle(c.key)}
              accessibilityRole="switch"
              accessibilityState={{ checked: enabled.has(c.key) }}
            >
              <Text style={[styles.chipText, enabled.has(c.key) && styles.chipTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {error && trees.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={() => void load(mode)}>
            <Text style={styles.link}>{fr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={DEFAULT_REGION}
            onLongPress={(e) => void onLongPress(e)}
            testID="map-view"
          >
            {tiles
              .filter((tl) => enabled.has(tl.key))
              .map((tl) => (
                <UrlTile key={tl.key} urlTemplate={tl.url} maximumZ={12} zIndex={1} opacity={0.75} />
              ))}
            {Object.entries(layers?.layers ?? {})
              .filter(([key]) => enabled.has(key))
              .flatMap(([key, fc]) =>
                fc.features.flatMap((f, i) =>
                  toPolygons(f.geometry).map((coords, j) => (
                    <Polygon
                      key={`${key}-${i}-${j}`}
                      coordinates={coords}
                      strokeColor={LAYER_STYLE[key]?.stroke ?? colors.accent}
                      fillColor={LAYER_STYLE[key]?.fill ?? "rgba(212,160,23,0.15)"}
                      strokeWidth={2}
                      zIndex={2}
                    />
                  )),
                ),
              )}
            {visible.map((tr) => (
              <Marker
                key={tr.id}
                coordinate={{ latitude: tr.latitude as number, longitude: tr.longitude as number }}
                title={
                  mode === "group"
                    ? (tr.owner_name ?? t.unknownMember)
                    : (tr.species_scientific_name ?? t.unknownSpecies)
                }
                description={
                  [
                    mode === "group" ? (tr.species_scientific_name ?? t.unknownSpecies) : null,
                    tr.measured_dbh_cm != null ? `DBH ${tr.measured_dbh_cm.toFixed(1)} cm` : null,
                    tr.co2e_kg != null ? `${(tr.co2e_kg / 1000).toFixed(1)} t CO₂e` : null,
                    tr.eudr_verdict ? t.verdicts[tr.eudr_verdict] : null,
                    tr.tree_code ?? null,
                  ]
                    .filter((p): p is string => p != null)
                    .join(" · ") || undefined
                }
                pinColor={tr.eudr_verdict ? VERDICT_COLORS[tr.eudr_verdict] : colors.accent}
              />
            ))}
            {point ? (
              <Marker
                coordinate={{ latitude: point.lat, longitude: point.lon }}
                pinColor={point.status === "done" ? VERDICT_COLORS[point.checks.verdict] : colors.textDim}
              />
            ) : null}
          </MapView>

          {loading ? (
            <View style={styles.loadingBadge}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.loadingText}>{fr.common.openingMap}</Text>
            </View>
          ) : null}
          {!loading && hiddenCount > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>+{hiddenCount} arbres</Text>
            </View>
          ) : null}

          {point ? (
            <View style={styles.pointSheet} testID="point-sheet">
              {point.status === "loading" ? (
                <View style={styles.rowCenter}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.dim}>{t.checking}</Text>
                </View>
              ) : point.status === "done" ? (
                <ForestChecksCard checks={point.checks} />
              ) : (
                <Text style={styles.dim}>{point.status === "off" ? t.gfwOff : t.checkFailed}</Text>
              )}
              <TouchableOpacity testID="point-close" onPress={() => setPoint(null)}>
                <Text style={styles.link}>{t.close}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.hintBadge}>
              <Text style={styles.hintText}>{t.longPressHint}</Text>
            </View>
          )}
        </View>
      )}

      <Modal visible={contextOpen} animationType="slide" onRequestClose={() => setContextOpen(false)}>
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} testID="context-modal">
          <Text style={styles.modalTitle}>{t.contextTitle}</Text>
          {!context ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              {context.highlights.map((h) => (
                <View key={h.key} style={styles.kv}>
                  <Text style={styles.kvLabel}>{h.label}</Text>
                  <Text style={styles.kvValue}>{`${compactFr(h.value)} ${h.unit}`}</Text>
                </View>
              ))}
              <Text style={styles.section}>{t.drivers(context.emissions_latest_year)}</Text>
              {context.emissions_by_driver.slice(0, 5).map((d) => (
                <View key={d.driver} style={styles.kv}>
                  <Text style={styles.kvLabel}>{d.label}</Text>
                  <Text style={styles.kvValue}>
                    {d.latest_share != null ? `${(d.latest_share * 100).toFixed(1)} %` : "—"}
                  </Text>
                </View>
              ))}
              <Text style={styles.source}>{t.contextSource}</Text>
            </>
          )}
          <TouchableOpacity testID="context-close" onPress={() => setContextOpen(false)}>
            <Text style={styles.link}>{t.close}</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  segment: {
    flexDirection: "row",
    margin: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: 8, alignItems: "center" },
  segBtnOn: { backgroundColor: colors.surfaceAlt },
  segText: { color: colors.textDim, fontSize: type.caption, fontWeight: "700" },
  segTextOn: { color: colors.accent, fontWeight: "800" },
  chips: { flexGrow: 0, marginBottom: spacing.xs },
  chipsContent: { paddingHorizontal: spacing.md, gap: spacing.xs },
  chip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: type.caption, fontWeight: "700" },
  chipTextOn: { color: colors.primary },
  map: { flex: 1 },
  mapWrap: { flex: 1, position: "relative" },
  loadingBadge: {
    position: "absolute",
    top: spacing.md,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(24,36,32,0.92)",
    borderRadius: 20,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  loadingText: { color: colors.text, fontSize: type.caption, fontWeight: "700" },
  countBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    backgroundColor: "rgba(24,36,32,0.92)",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
  },
  countText: { color: colors.textDim, fontSize: type.caption, fontWeight: "600" },
  hintBadge: {
    position: "absolute",
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: "rgba(24,36,32,0.85)",
    borderRadius: 10,
    padding: spacing.sm,
  },
  hintText: { color: colors.textDim, fontSize: type.caption, textAlign: "center" },
  pointSheet: {
    position: "absolute",
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dim: { color: colors.textDim, fontSize: type.body },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  error: { color: colors.error, fontSize: type.body },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700", marginTop: spacing.sm },
  modal: { flex: 1, backgroundColor: colors.background },
  modalContent: { padding: spacing.lg, gap: spacing.sm },
  modalTitle: { color: colors.text, fontSize: type.title, fontWeight: "800" },
  section: { color: colors.accent, fontSize: type.heading, fontWeight: "700", marginTop: spacing.md },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  kvLabel: { color: colors.textDim, fontSize: type.body, flexShrink: 1 },
  kvValue: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  source: { color: colors.textDim, fontSize: type.caption, marginTop: spacing.md },
});
