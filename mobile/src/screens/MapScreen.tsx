import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { ChartColumn, Crosshair, Layers, Maximize, Search, X } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  LongPressEvent,
  MapType,
  Marker,
  Polygon,
  Region,
  UrlTile,
} from "react-native-maps";

import {
  checkMapPoint,
  ForestChecks,
  getMapFeature,
  getMapLayers,
  getMapTiles,
  getNationalContext,
  listGroupTrees,
  listMyTrees,
  listProjects,
  Project,
  MapFeatureDetail,
  MapLayers,
  MapSearchResult,
  MapTileLayer,
  MyTree,
  NationalContext,
  searchMap,
} from "../api/client";
import ForestChecksCard, { VERDICT_COLORS } from "../components/ForestChecksCard";
import { fr } from "../i18n/fr";
import { useSystemInsets } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { compactFr, toPolygons } from "../utils/geojson";
import { bboxFor, clusterPoints, regionForBox, zoomFor } from "../utils/mapMath";

type Mode = "mine" | "group";
type MapTree = MyTree & { owner_name?: string | null };
type Verdict = "conforme" | "a_verifier" | "risque_deforestation" | "none";

const t = fr.map;

const GABON: Region = { latitude: -0.7, longitude: 11.6, latitudeDelta: 6, longitudeDelta: 6 };
const PREFS_KEY = "forestry:map-prefs";
const FETCH_DEBOUNCE_MS = 450;
const VECTOR_KEYS = ["aac", "protected_areas", "logging_concessions", "mining_concessions"];
const VERDICTS: Verdict[] = ["conforme", "a_verifier", "risque_deforestation", "none"];

/** Stroke / fill per vector layer (legend swatches use the stroke). */
export const LAYER_STYLE: Record<string, { stroke: string; fill: string }> = {
  aac: { stroke: "#D4A017", fill: "rgba(212,160,23,0.20)" },
  protected_areas: { stroke: "#2E9E5B", fill: "rgba(46,158,91,0.18)" },
  logging_concessions: { stroke: "#B5651D", fill: "rgba(181,101,29,0.12)" },
  mining_concessions: { stroke: "#7E57C2", fill: "rgba(126,87,194,0.14)" },
};

const mapCache = new Map<Mode, MapTree[]>();

interface Prefs {
  enabled: string[];
  mapType: MapType;
  verdicts: Verdict[];
  projects: boolean;
}

const DEFAULT_PREFS: Prefs = {
  enabled: ["aac", "protected_areas"],
  mapType: "standard",
  verdicts: [...VERDICTS],
  projects: true,
};

const PROJECT_COLORS = { chantier: "#C99A1E", open: "#1F6FB2" };

function projectPosition(p: Project): { latitude: number; longitude: number } | null {
  const latitude = p.latitude ?? p.aac_lat ?? null;
  const longitude = p.longitude ?? p.aac_lon ?? null;
  return latitude != null && longitude != null ? { latitude, longitude } : null;
}

type PointState =
  | { status: "loading"; lat: number; lon: number }
  | { status: "done"; lat: number; lon: number; checks: ForestChecks }
  | { status: "off" | "error"; lat: number; lon: number };

function verdictOf(tree: MapTree): Verdict {
  const v = tree.eudr_verdict;
  return v === "conforme" || v === "a_verifier" || v === "risque_deforestation" ? v : "none";
}

function isTouchScreen(): boolean {
  const nav = (globalThis as { navigator?: { maxTouchPoints?: number } }).navigator;
  return (nav?.maxTouchPoints ?? 0) > 0;
}

export default function MapScreen({
  onOpenProject,
  role,
}: { onOpenProject?: (p: Project) => void; role?: string } = {}) {
  // A company manager rarely scans: the team's scans come first. The Ministry
  // has no team, so it only sees its own scans.
  const initialMode: Mode = role === "company" ? "group" : "mine";
  const showModes = role !== "admin";
  const th = useTheme();
  const styles = useStyles();
  const insets = useSystemInsets();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [project, setProject] = React.useState<Project | null>(null);
  React.useEffect(() => {
    let alive = true;
    listProjects()
      .then((rows) => {
        if (alive) setProjects(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [trees, setTrees] = React.useState<MapTree[]>(() => mapCache.get(initialMode) ?? []);
  const [loading, setLoading] = React.useState(() => !mapCache.has(initialMode));
  const [error, setError] = React.useState<string | null>(null);
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULT_PREFS);
  const [tiles, setTiles] = React.useState<MapTileLayer[]>([]);
  const [layers, setLayers] = React.useState<MapLayers | null>(null);
  const [fetching, setFetching] = React.useState(false);
  const lastFetch = React.useRef<{ box: [number, number, number, number]; zoom: number; key: string } | null>(null);
  const [region, setRegion] = React.useState<Region>(GABON);
  const [legendOpen, setLegendOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<MapSearchResult[] | null>(null);
  const [feature, setFeature] = React.useState<MapFeatureDetail | null>(null);
  const [point, setPoint] = React.useState<PointState | null>(null);
  React.useEffect(() => {
    if (feature || point) setProject(null);
  }, [feature, point]);
  const [context, setContext] = React.useState<NationalContext | null>(null);
  const [contextOpen, setContextOpen] = React.useState(false);
  const mapRef = React.useRef<MapView>(null);
  const fetchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = React.useRef(0);

  // --- preferences (layers, base map, filters) survive app restarts -------
  React.useEffect(() => {
    void AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (raw) setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) });
      })
      .catch(() => undefined);
  }, []);
  const updatePrefs = (patch: Partial<Prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });

  // --- scans -----------------------------------------------------------------
  const loadTrees = React.useCallback(async (m: Mode) => {
    const cached = mapCache.get(m);
    if (cached) {
      setTrees(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const rows: MapTree[] = m === "mine" ? await listMyTrees(500) : await listGroupTrees(1000);
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
    void loadTrees(mode);
  }, [loadTrees, mode]);

  React.useEffect(() => {
    void getMapTiles()
      .then(setTiles)
      .catch(() => setTiles([]));
  }, []);

  // --- vector layers follow the viewport (debounced, last request wins) ----
  const enabledVectors = prefs.enabled.filter((k) => VECTOR_KEYS.includes(k));
  const enabledKey = enabledVectors.join(",");
  React.useEffect(() => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => {
      const id = ++requestId.current;
      if (!enabledKey) {
        lastFetch.current = null;
        setLayers((prev) => (prev ? { ...prev, layers: {} } : prev));
        return;
      }
      const view = bboxFor(region, 0);
      const zoom = zoomFor(region);
      const last = lastFetch.current;
      if (
        last &&
        last.key === enabledKey &&
        Math.abs(last.zoom - zoom) < 0.9 &&
        view[0] >= last.box[0] &&
        view[1] >= last.box[1] &&
        view[2] <= last.box[2] &&
        view[3] <= last.box[3]
      ) {
        return;
      }
      const box = bboxFor(region, 1);
      const showTimer = setTimeout(() => {
        if (id === requestId.current) setFetching(true);
      }, 600);
      void getMapLayers({ zoom, bbox: box, layers: enabledKey.split(",") })
        .then((data) => {
          if (id === requestId.current) {
            lastFetch.current = { box, zoom, key: enabledKey };
            setLayers(data);
          }
        })
        .catch((err) => console.error("map layers failed", err))
        .finally(() => {
          clearTimeout(showTimer);
          if (id === requestId.current) setFetching(false);
        });
    }, FETCH_DEBOUNCE_MS);
    return () => {
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
    };
  }, [region, enabledKey]);

  // --- search ----------------------------------------------------------------
  const onQuery = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) {
      setResults(null);
      return;
    }
    searchTimer.current = setTimeout(() => {
      void searchMap(text.trim())
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
  };

  const goToResult = (r: MapSearchResult) => {
    setResults(null);
    setQuery(r.name);
    if (r.west != null && r.south != null && r.east != null && r.north != null) {
      mapRef.current?.animateToRegion(regionForBox(r.west, r.south, r.east, r.north), 500);
    } else if (r.lat != null && r.lon != null) {
      mapRef.current?.animateToRegion(
        { latitude: r.lat, longitude: r.lon, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        500,
      );
    }
    if (r.id != null && r.kind !== "tree") void openFeature(r.layer, r.id);
  };

  // --- interactions ------------------------------------------------------------
  const openFeature = async (layer: string, id: number) => {
    setPoint(null);
    try {
      setFeature(await getMapFeature(layer, id));
    } catch (err) {
      console.error("feature detail failed", err);
    }
  };

  const runPointCheck = async (lat: number, lon: number) => {
    setFeature(null);
    setPoint({ status: "loading", lat, lon });
    try {
      const checks = await checkMapPoint(lat, lon);
      setPoint(checks ? { status: "done", lat, lon, checks } : { status: "off", lat, lon });
    } catch (err) {
      console.error("point check failed", err);
      setPoint({ status: "error", lat, lon });
    }
  };

  const onLongPress = (e: LongPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    void runPointCheck(latitude, longitude);
  };

  const locate = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      mapRef.current?.animateToRegion(
        { latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        500,
      );
    } catch (err) {
      console.error("locate failed", err);
    }
  };

  const filtered = React.useMemo(
    () => trees.filter((tr) => prefs.verdicts.includes(verdictOf(tr))),
    [trees, prefs.verdicts],
  );

  const fit = () => {
    if (filtered.length === 0) {
      mapRef.current?.animateToRegion(GABON, 500);
      return;
    }
    const lats = filtered.map((tr) => tr.latitude as number);
    const lons = filtered.map((tr) => tr.longitude as number);
    mapRef.current?.animateToRegion(
      regionForBox(Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats), 1.6),
      500,
    );
  };

  const clusters = React.useMemo(
    () =>
      clusterPoints(
        filtered.map((tr) => ({ latitude: tr.latitude as number, longitude: tr.longitude as number, item: tr })),
        region,
      ),
    [filtered, region],
  );

  const verdictCounts = React.useMemo(() => {
    const out: Record<Verdict, number> = { conforme: 0, a_verifier: 0, risque_deforestation: 0, none: 0 };
    for (const tr of trees) out[verdictOf(tr)] += 1;
    return out;
  }, [trees]);

  const toggleLayer = (key: string) =>
    updatePrefs({
      enabled: prefs.enabled.includes(key) ? prefs.enabled.filter((k) => k !== key) : [...prefs.enabled, key],
    });

  const toggleVerdict = (v: Verdict) =>
    updatePrefs({
      verdicts: prefs.verdicts.includes(v) ? prefs.verdicts.filter((x) => x !== v) : [...prefs.verdicts, v],
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

  const labelFor = (key: string) => layers?.labels[key] ?? key;

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <View style={styles.searchBox}>
          <Search size={18} color={th.c.muted} />
          <TextInput
            testID="map-search"
            style={styles.searchInput}
            value={query}
            onChangeText={onQuery}
            placeholder={t.searchPlaceholder}
            placeholderTextColor={th.c.muted}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity testID="map-search-clear" onPress={() => onQuery("")}>
              <X size={18} color={th.c.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
        {results ? (
          <View style={styles.results} testID="map-search-results">
            {results.length === 0 ? (
              <Text style={styles.dim}>{t.noResults}</Text>
            ) : (
              results.map((r, i) => (
                <TouchableOpacity
                  key={`${r.kind}-${r.id ?? r.name}-${i}`}
                  testID={`search-result-${i}`}
                  style={styles.result}
                  onPress={() => goToResult(r)}
                >
                  <View style={[styles.swatch, { backgroundColor: LAYER_STYLE[r.layer]?.stroke ?? th.c.olive }]} />
                  <View style={styles.flex}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {r.subtitle ? (
                      <Text style={styles.dimSmall} numberOfLines={1}>
                        {r.subtitle}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        ) : null}
        {showModes ? (
        <View style={styles.segment}>
          {(role === "company" ? (["group", "mine"] as Mode[]) : (["mine", "group"] as Mode[])).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.segBtn, mode === m && styles.segBtnOn]}
              onPress={() => setMode(m)}
              accessibilityState={{ selected: mode === m }}
            >
              <Text style={[styles.segText, mode === m && styles.segTextOn]}>
                {m === "mine" ? (role === "company" ? t.mineScans : t.mine) : role === "company" ? t.team : t.group}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        ) : null}
      </View>

      {error && trees.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={() => void loadTrees(mode)}>
            <Text style={styles.link}>{fr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.flex}
            initialRegion={GABON}
            mapType={prefs.mapType}
            onRegionChangeComplete={setRegion}
            onLongPress={onLongPress}
            showsUserLocation
            toolbarEnabled={false}
            testID="map-view"
          >
            {tiles
              .filter((tl) => prefs.enabled.includes(tl.key))
              .map((tl) => (
                <UrlTile key={tl.key} urlTemplate={tl.url} maximumZ={13} zIndex={1} opacity={0.8} />
              ))}
            {Object.entries(layers?.layers ?? {})
              .filter(([key]) => prefs.enabled.includes(key))
              .flatMap(([key, fc]) =>
                fc.features.flatMap((f, i) =>
                  toPolygons(f.geometry).map((coords, j) => (
                    <Polygon
                      key={`${key}-${String(f.properties.id ?? i)}-${j}`}
                      coordinates={coords}
                      strokeColor={LAYER_STYLE[key]?.stroke ?? th.c.olive}
                      fillColor={LAYER_STYLE[key]?.fill ?? "rgba(212,160,23,0.15)"}
                      strokeWidth={key === "aac" ? 3 : 1.5}
                      zIndex={key === "aac" ? 4 : 2}
                      tappable
                      onPress={() =>
                        f.properties.id != null && void openFeature(key, Number(f.properties.id))
                      }
                    />
                  )),
                ),
              )}
            {clusters.map((c) =>
              c.items.length === 1 ? (
                <Marker
                  key={`tree-${c.items[0].id}`}
                  coordinate={{ latitude: c.latitude, longitude: c.longitude }}
                  title={
                    mode === "group"
                      ? (c.items[0].owner_name ?? t.unknownMember)
                      : (c.items[0].species_scientific_name ?? t.unknownSpecies)
                  }
                  description={
                    [
                      c.items[0].measured_dbh_cm != null ? `DBH ${c.items[0].measured_dbh_cm.toFixed(1)} cm` : null,
                      c.items[0].co2e_kg != null ? `${(c.items[0].co2e_kg / 1000).toFixed(1)} t CO₂e` : null,
                      c.items[0].eudr_verdict ? t.verdicts[c.items[0].eudr_verdict] : null,
                      c.items[0].tree_code ?? null,
                    ]
                      .filter((p): p is string => p != null)
                      .join(" · ") || undefined
                  }
                  pinColor={c.items[0].eudr_verdict ? VERDICT_COLORS[c.items[0].eudr_verdict] : th.c.olive}
                  zIndex={10}
                />
              ) : (
                <Marker
                  key={`cluster-${c.key}`}
                  testID="cluster"
                  coordinate={{ latitude: c.latitude, longitude: c.longitude }}
                  zIndex={10}
                  onPress={() =>
                    mapRef.current?.animateToRegion(
                      {
                        latitude: c.latitude,
                        longitude: c.longitude,
                        latitudeDelta: region.latitudeDelta / 4,
                        longitudeDelta: region.longitudeDelta / 4,
                      },
                      400,
                    )
                  }
                >
                  <View style={styles.cluster}>
                    <Text style={styles.clusterText}>{c.items.length}</Text>
                  </View>
                </Marker>
              ),
            )}
            {prefs.projects
              ? projects.map((p) => {
                  const position = projectPosition(p);
                  if (!position) return null;
                  const chantier = p.kind === "chantier";
                  return (
                    <Marker
                      key={`project-${p.id}`}
                      testID={`project-pin-${p.id}`}
                      coordinate={position}
                      title={p.title}
                      description={chantier ? fr.home.kindChantier : fr.home.kindOpen}
                      pinColor={chantier ? PROJECT_COLORS.chantier : PROJECT_COLORS.open}
                      zIndex={12}
                      onPress={() => {
                        setFeature(null);
                        setPoint(null);
                        setProject(p);
                      }}
                    />
                  );
                })
              : null}
            {point ? (
              <Marker
                coordinate={{ latitude: point.lat, longitude: point.lon }}
                pinColor={point.status === "done" ? VERDICT_COLORS[point.checks.verdict] : th.c.muted}
                zIndex={11}
              />
            ) : null}
          </MapView>

          <View style={styles.fabs}>
            <TouchableOpacity testID="legend-button" style={styles.fab} onPress={() => setLegendOpen(true)}>
              <Layers size={20} color={th.c.onOlive} />
            </TouchableOpacity>
            <TouchableOpacity testID="locate-button" style={styles.fab} onPress={() => void locate()}>
              <Crosshair size={20} color={th.c.onOlive} />
            </TouchableOpacity>
            <TouchableOpacity testID="fit-button" style={styles.fab} onPress={fit}>
              <Maximize size={20} color={th.c.onOlive} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="context-button"
              style={styles.fab}
              onPress={() => void openContext()}
              accessibilityRole="button"
              accessibilityLabel={t.contextTitle}
            >
              <ChartColumn size={20} color={th.c.onOlive} />
            </TouchableOpacity>
          </View>

          {loading || fetching ? (
            <View style={styles.loadingBadge}>
              <ActivityIndicator color={th.c.olive} size="small" />
              <Text style={styles.loadingText}>{loading ? fr.common.openingMap : t.updating}</Text>
            </View>
          ) : null}

          {project ? (
            <View style={styles.sheet} testID="project-sheet">
              <View style={styles.sheetHead}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: project.kind === "chantier" ? PROJECT_COLORS.chantier : PROJECT_COLORS.open },
                  ]}
                />
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {project.title}
                </Text>
              </View>
              <Text style={styles.dimSmall}>
                {`${project.kind === "chantier" ? fr.home.kindChantier : fr.home.kindOpen} · ${t.projectStatus[project.status] ?? project.status}`}
              </Text>
              {project.aac_label ? (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>AAC</Text>
                  <Text style={styles.kvValue}>{project.aac_label}</Text>
                </View>
              ) : null}
              {project.company_name ? (
                <View style={styles.kv} testID="project-company">
                  <Text style={styles.kvLabel}>{t.company}</Text>
                  <Text style={styles.kvValue} numberOfLines={1}>
                    {project.company_name}
                  </Text>
                </View>
              ) : null}
              {project.title_ref ? (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>{t.titleRef}</Text>
                  <Text style={styles.kvValue} numberOfLines={1}>
                    {project.title_ref}
                  </Text>
                </View>
              ) : null}
              {project.aac_surface_ha != null ? (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>{t.area}</Text>
                  <Text style={styles.kvValue}>{`${compactFr(project.aac_surface_ha)} ha`}</Text>
                </View>
              ) : null}
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>{t.projectsSection}</Text>
                <Text style={styles.kvValue}>
                  {project.kind === "chantier" && project.registry_trees
                    ? fr.home.chantierProgress(project.registry_scanned ?? 0, project.registry_trees)
                    : `${fr.home.participants(project.participant_count)} · ${t.scansCount(project.scan_count)}`}
                </Text>
              </View>
              <View style={styles.sheetActions}>
                {onOpenProject ? (
                  <TouchableOpacity testID="project-open" style={styles.primaryBtn} onPress={() => onOpenProject(project)}>
                    <Text style={styles.primaryText}>{t.openProject}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity testID="project-close" onPress={() => setProject(null)}>
                  <Text style={styles.link}>{t.close}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : feature ? (
            <View style={styles.sheet} testID="feature-sheet">
              <View style={styles.sheetHead}>
                <View style={[styles.swatch, { backgroundColor: LAYER_STYLE[feature.layer]?.stroke ?? th.c.olive }]} />
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {feature.name ?? labelFor(feature.layer)}
                </Text>
              </View>
              <Text style={styles.dimSmall}>{labelFor(feature.layer)}</Text>
              {feature.area_ha != null ? (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>{t.area}</Text>
                  <Text style={styles.kvValue}>{`${compactFr(feature.area_ha)} ha`}</Text>
                </View>
              ) : null}
              {feature.holder ? (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>{t.holder}</Text>
                  <Text style={styles.kvValue}>{feature.holder}</Text>
                </View>
              ) : null}
              {Object.entries({ ...(feature.attrs ?? {}), status: feature.status, title_ref: feature.title_ref })
                .filter(([k, v]) => t.attrLabels[k] && v != null && v !== "")
                .slice(0, 5)
                .map(([k, v]) => (
                  <View key={k} style={styles.kv}>
                    <Text style={styles.kvLabel}>{t.attrLabels[k]}</Text>
                    <Text style={styles.kvValue} numberOfLines={1}>
                      {k === "status" ? String(v).charAt(0).toUpperCase() + String(v).slice(1) : String(v)}
                    </Text>
                  </View>
                ))}
              <View style={styles.sheetActions}>
                {feature.lat != null && feature.lon != null ? (
                  <TouchableOpacity
                    testID="feature-check"
                    style={styles.primaryBtn}
                    onPress={() => void runPointCheck(feature.lat as number, feature.lon as number)}
                  >
                    <Text style={styles.primaryText}>{t.checkHere}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity testID="feature-close" onPress={() => setFeature(null)}>
                  <Text style={styles.link}>{t.close}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : point ? (
            <View style={styles.sheet} testID="point-sheet">
              {point.status === "loading" ? (
                <View style={styles.rowCenter}>
                  <ActivityIndicator color={th.c.olive} />
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
              <Text style={styles.hintText}>
                {`${t.shownOf(filtered.length, trees.length)} · ${Platform.OS === "web" && !isTouchScreen() ? t.rightClickHint : t.longPressHint}`}
              </Text>
            </View>
          )}
        </View>
      )}

      <Modal visible={legendOpen} transparent animationType="slide" onRequestClose={() => setLegendOpen(false)}>
        <View style={styles.backdrop}>
          <ScrollView
            style={styles.legend}
            contentContainerStyle={[styles.legendContent, { paddingBottom: th.space.xl + insets.bottom }]}
            testID="legend-sheet"
          >
            <Text style={styles.legendTitle}>{t.layers}</Text>

            <Text style={styles.section}>{t.baseMap}</Text>
            <View style={styles.rowWrap}>
              {(
                [
                  ["standard", t.baseStandard],
                  ["satellite", t.baseSatellite],
                  ["hybrid", t.baseHybrid],
                ] as [MapType, string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  testID={`base-${value}`}
                  style={[styles.chip, prefs.mapType === value && styles.chipOn]}
                  onPress={() => updatePrefs({ mapType: value })}
                >
                  <Text style={[styles.chipText, prefs.mapType === value && styles.chipTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.section}>{t.gfwLayers}</Text>
            {tiles.map((tl) => (
              <LegendRow
                key={tl.key}
                testID={`layer-${tl.key}`}
                color={tl.key === "radd_alerts" ? "#E91E63" : "#FF6F61"}
                label={tl.label}
                on={prefs.enabled.includes(tl.key)}
                onPress={() => toggleLayer(tl.key)}
              />
            ))}

            <Text style={styles.section}>{t.vectorLayers}</Text>
            {VECTOR_KEYS.map((key) => (
              <LegendRow
                key={key}
                testID={`layer-${key}`}
                color={LAYER_STYLE[key].stroke}
                label={labelFor(key)}
                count={layers?.counts?.[key]}
                on={prefs.enabled.includes(key)}
                onPress={() => toggleLayer(key)}
              />
            ))}

            <Text style={styles.section}>{t.projectsSection}</Text>
            <LegendRow
              testID="layer-projects"
              color={PROJECT_COLORS.chantier}
              label={t.projectsLayer}
              count={projects.filter((p) => projectPosition(p) != null).length}
              on={prefs.projects}
              onPress={() => updatePrefs({ projects: !prefs.projects })}
            />

            <Text style={styles.section}>{t.scansFilter}</Text>
            {VERDICTS.map((v) => (
              <LegendRow
                key={v}
                testID={`verdict-${v}`}
                color={v === "none" ? th.c.olive : VERDICT_COLORS[v]}
                label={v === "none" ? t.unknownVerdict : t.verdicts[v]}
                count={verdictCounts[v]}
                on={prefs.verdicts.includes(v)}
                onPress={() => toggleVerdict(v)}
              />
            ))}

            <TouchableOpacity
              testID="legend-context"
              onPress={() => {
                setLegendOpen(false);
                void openContext();
              }}
            >
              <Text style={styles.link}>{`${t.contextTitle} ›`}</Text>
            </TouchableOpacity>

            <TouchableOpacity testID="legend-close" onPress={() => setLegendOpen(false)}>
              <Text style={styles.link}>{t.close}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={contextOpen} animationType="slide" onRequestClose={() => setContextOpen(false)}>
        <ScrollView
          style={styles.modal}
          contentContainerStyle={[styles.modalContent, { paddingTop: th.space.xl + insets.top, paddingBottom: th.space.xl + insets.bottom }]}
          testID="context-modal"
        >
          <Text style={styles.legendTitle}>{t.contextTitle}</Text>
          {!context ? (
            <ActivityIndicator color={th.c.olive} />
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
              <Text style={styles.dimSmall}>{t.contextSource}</Text>
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

function LegendRow({
  testID,
  color,
  label,
  count,
  on,
  onPress,
}: {
  testID: string;
  color: string;
  label: string;
  count?: number;
  on: boolean;
  onPress: () => void;
}) {
  const th = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity
      testID={testID}
      style={styles.legendRow}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
    >
      <View style={[styles.swatch, { backgroundColor: color, opacity: on ? 1 : 0.3 }]} />
      <Text style={[styles.legendLabel, !on && styles.legendOff]} numberOfLines={1}>
        {label}
      </Text>
      {count != null ? <Text style={styles.dimSmall}>{count}</Text> : null}
      <View style={[styles.toggle, on && styles.toggleOn]}>
        <View style={[styles.knob, on && styles.knobOn]} />
      </View>
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((th) => ({
  container: { flex: 1, backgroundColor: th.c.bg },
  flex: { flex: 1 },
  top: { paddingHorizontal: th.space.lg, paddingTop: th.space.sm, gap: th.space.xs, zIndex: 20 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.lg,
  },
  searchInput: { flex: 1, color: th.c.ink, fontSize: 15, fontFamily: th.fonts.body, paddingVertical: th.space.sm },
  results: {
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.xs,
  },
  result: { flexDirection: "row", alignItems: "center", gap: th.space.sm, padding: th.space.sm },
  resultName: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  segment: {
    flexDirection: "row",
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.xs,
    gap: th.space.xs,
  },
  segBtn: { flex: 1, paddingVertical: th.space.xs, borderRadius: 8, alignItems: "center" },
  segBtnOn: { backgroundColor: th.c.surface2 },
  segText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  segTextOn: { color: th.c.olive, fontFamily: th.fonts.bodyBold },
  mapWrap: { flex: 1, position: "relative", marginTop: th.space.xs },
  fabs: { position: "absolute", right: th.space.lg, top: th.space.lg, gap: th.space.sm },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: th.c.olive,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  cluster: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 6,
    backgroundColor: "rgba(212,160,23,0.95)",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  clusterText: { color: th.c.onOlive, fontFamily: th.fonts.bodyBold, fontSize: 12 },
  loadingBadge: {
    position: "absolute",
    top: th.space.lg,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    backgroundColor: "rgba(24,36,32,0.92)",
    borderRadius: 20,
    paddingVertical: th.space.xs,
    paddingHorizontal: th.space.lg,
  },
  loadingText: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold },
  hintBadge: {
    position: "absolute",
    bottom: th.space.lg,
    left: th.space.lg,
    right: th.space.lg,
    backgroundColor: "rgba(24,36,32,0.85)",
    borderRadius: 10,
    padding: th.space.sm,
  },
  hintText: { color: "#F4F3EC", fontSize: 12, fontFamily: th.fonts.body, textAlign: "center" },
  sheet: {
    position: "absolute",
    bottom: th.space.lg,
    left: th.space.lg,
    right: th.space.lg,
    maxWidth: 560,
    backgroundColor: th.c.surface,
    borderRadius: 14,
    padding: th.space.lg,
    gap: th.space.xs,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  sheetTitle: { color: th.c.ink, fontSize: 19, fontFamily: th.fonts.bodyBold, flex: 1 },
  sheetActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: th.space.xs },
  primaryBtn: { backgroundColor: th.c.olive, borderRadius: 10, paddingHorizontal: th.space.lg, paddingVertical: th.space.sm },
  primaryText: { color: th.c.onOlive, fontFamily: th.fonts.bodyBold, fontSize: 15 },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body },
  dimSmall: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.lg },
  error: { color: th.c.risk, fontSize: 15, fontFamily: th.fonts.body },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold, marginTop: th.space.sm },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  legend: {
    maxHeight: "80%",
    backgroundColor: th.c.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  legendContent: { padding: th.space.xl, gap: th.space.xs },
  legendTitle: { color: th.c.ink, fontSize: 26, fontFamily: th.fonts.bodyBold },
  section: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold, marginTop: th.space.lg },
  legendRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.xs },
  legendLabel: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.body, flex: 1 },
  legendOff: { color: th.c.muted },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  toggle: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: th.c.surface2,
    padding: 2,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: th.c.olive },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },
  chip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.lg,
    paddingVertical: 4,
  },
  chipOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  chipText: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold },
  chipTextOn: { color: th.c.onOlive },
  modal: { flex: 1, backgroundColor: th.c.bg },
  modalContent: { padding: th.space.xl, gap: th.space.sm },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: th.space.lg },
  kvLabel: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, flexShrink: 1 },
  kvValue: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold, flexShrink: 1, textAlign: "right" },
}));
