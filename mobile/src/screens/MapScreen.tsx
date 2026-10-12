import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";

import { listGroupTrees, listMyTrees, MyTree } from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

type Mode = "mine" | "group";

type MapTree = MyTree & { owner_name?: string | null };

const DEFAULT_REGION: Region = {
  latitude: 0.4162,
  longitude: 9.4541,
  latitudeDelta: 5,
  longitudeDelta: 5,
};

const MAX_MARKERS = 150;

const mapCache = new Map<Mode, MapTree[]>();

function regionFor(rows: MapTree[]): Region {
  if (rows.length === 0) return DEFAULT_REGION;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const t of rows) {
    const lat = t.latitude as number;
    const lon = t.longitude as number;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.05, (maxLat - minLat) * 1.6 + 0.02),
    longitudeDelta: Math.max(0.05, (maxLon - minLon) * 1.6 + 0.02),
  };
}

export default function MapScreen() {
  const [mode, setMode] = React.useState<Mode>("mine");
  const [trees, setTrees] = React.useState<MapTree[]>(() => mapCache.get("mine") ?? []);
  const [loading, setLoading] = React.useState(() => !mapCache.has("mine"));
  const [error, setError] = React.useState<string | null>(null);
  const mapRef = React.useRef<MapView>(null);

  const load = React.useCallback(async (m: Mode) => {
    const cached = mapCache.get(m);
    if (cached) {
      setTrees(cached);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const rows: MapTree[] = m === "mine" ? await listMyTrees(200) : await listGroupTrees(500);
      const geo = rows.filter((t) => t.latitude != null && t.longitude != null);
      mapCache.set(m, geo);
      setTrees(geo);
    } catch (err) {
      console.error("map trees failed", err);
      if (!mapCache.has(m)) setError(fr.map.error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(mode);
  }, [load, mode]);

  const visible = React.useMemo(() => trees.slice(0, MAX_MARKERS), [trees]);
  const hiddenCount = trees.length - visible.length;

  React.useEffect(() => {
    if (trees.length > 0) {
      const next = regionFor(trees);
      mapRef.current?.animateToRegion(next, 400);
    }
  }, [trees]);

  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segBtn, mode === "mine" && styles.segBtnOn]}
          onPress={() => setMode("mine")}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "mine" }}
        >
          <Text style={[styles.segText, mode === "mine" && styles.segTextOn]}>
            {fr.map.mine}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, mode === "group" && styles.segBtnOn]}
          onPress={() => setMode("group")}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "group" }}
        >
          <Text style={[styles.segText, mode === "group" && styles.segTextOn]}>
            {fr.map.group}
          </Text>
        </TouchableOpacity>
      </View>

      {error && trees.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={() => load(mode)}>
            <Text style={styles.link}>{fr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mapWrap}>
          <MapView ref={mapRef} style={styles.map} initialRegion={DEFAULT_REGION}>
            {visible.map((t) => (
              <Marker
                key={t.id}
                coordinate={{ latitude: t.latitude as number, longitude: t.longitude as number }}
                title={
                  mode === "group"
                    ? t.owner_name ?? fr.map.unknownMember
                    : t.species_scientific_name ?? fr.map.unknownSpecies
                }
                description={
                  [
                    mode === "group" ? (t.species_scientific_name ?? fr.map.unknownSpecies) : null,
                    t.measured_dbh_cm != null ? `DBH ${t.measured_dbh_cm.toFixed(1)} cm` : null,
                    t.estimated_age_years != null ? `Âge ${Math.round(t.estimated_age_years)} a` : null,
                  ]
                    .filter((p): p is string => p != null)
                    .join(" · ") || undefined
                }
                pinColor={colors.accent}
              />
            ))}
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
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  segment: {
    flexDirection: "row",
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: "center",
  },
  segBtnOn: { backgroundColor: colors.surfaceAlt },
  segText: { color: colors.textDim, fontSize: type.body, fontWeight: "600" },
  segTextOn: { color: colors.accent, fontWeight: "800" },
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  loadingText: { color: colors.text, fontSize: type.caption, fontWeight: "700" },
  countBadge: {
    position: "absolute",
    bottom: spacing.md,
    alignSelf: "center",
    backgroundColor: "rgba(24,36,32,0.92)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
  },
  countText: { color: colors.textDim, fontSize: type.caption, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  error: { color: colors.error, fontSize: type.body },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700", marginTop: spacing.sm },
});
