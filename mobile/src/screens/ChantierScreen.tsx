import { MapPin, ScanLine, Users } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import MapView, { Marker, Polygon } from "react-native-maps";

import {
  acceptProjectInvitation,
  ChantierTree,
  ChantierView,
  declineProjectInvitation,
  getChantier,
  leaveProject,
} from "../api/client";
import { dec } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, Divider, EmptyState, Pill, ScreenHeader, Segmented, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import { toPolygons } from "../utils/geojson";
import { regionForBox } from "../utils/mapMath";

const t = fr.chantier;
const MEASURED = "#5DBE7E";
const TO_MEASURE = "#D9B44A";
const MINE = "#2C64A6";

type Tab = "todo" | "done";

interface Props {
  id: number;
  onBack: () => void;
  onScan: (project: { id: number; title: string; kind: "chantier" }) => void;
}

function personName(m: ChantierView["team"][number]): string {
  return [m.first_name, m.last_name].filter(Boolean).join(" ") || m.display_name;
}

export default function ChantierScreen({ id, onBack, onScan }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [data, setData] = useState<ChantierView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("todo");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<number | null>(null);
  const mapRef = useRef<MapView>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getChantier(id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const polygons = useMemo(() => toPolygons(data?.aac?.geometry ?? null), [data]);
  const region = useMemo(() => {
    const points = [
      ...polygons.flat(),
      ...(data?.trees ?? [])
        .filter((tr) => tr.latitude != null && tr.longitude != null)
        .map((tr) => ({ latitude: tr.latitude as number, longitude: tr.longitude as number })),
    ];
    if (!points.length) return null;
    const lats = points.map((p) => p.latitude);
    const lons = points.map((p) => p.longitude);
    return regionForBox(Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats));
  }, [polygons, data]);

  const act = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await action();
      if (after) after();
      else await load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const focus = (tree: ChantierTree) => {
    setFocused(tree.id);
    if (tree.latitude == null || tree.longitude == null) return;
    mapRef.current?.animateToRegion(
      { latitude: tree.latitude, longitude: tree.longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 },
      400,
    );
  };

  const header = (
    <ScreenHeader eyebrow={t.eyebrow} title={data?.title ?? t.eyebrow} onBack={onBack} backLabel={fr.history.back} />
  );

  if (loading && !data) {
    return (
      <View style={s.screen}>
        {header}
        <ActivityIndicator style={s.loader} color={theme.c.olive} />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={s.screen}>
        {header}
        <EmptyState message={t.loadError} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
      </View>
    );
  }

  const todo = data.trees.filter((tr) => !tr.measured);
  const done = data.trees.filter((tr) => tr.measured);
  const list = tab === "todo" ? todo : done;
  const ratio = data.progress.total ? data.progress.measured / data.progress.total : 0;
  const active = data.my_status === "active";
  const open = data.status === "open";

  return (
    <View style={s.screen} testID="chantier-screen">
      {header}
      <ScrollView contentContainerStyle={s.content}>
        <Card raised>
          {data.aac ? (
            <View style={s.aacRow}>
              <MapPin size={16} color={theme.c.goldInk} />
              <Txt variant="small" bold style={s.flex} testID="chantier-aac">
                {[data.aac.label, data.aac.ufa_label, data.aac.title_reference].filter(Boolean).join(" · ")}
              </Txt>
              <Pill tone={data.aac.status === "ouvert" ? "ok" : "neutral"} label={t.aacStatus(data.aac.status)} />
            </View>
          ) : null}
          {data.created_by_name ? (
            <Txt variant="caption" tone="muted">
              {t.openedBy(data.created_by_name)}
            </Txt>
          ) : null}
          {data.description ? <Txt variant="small">{data.description}</Txt> : null}
          <View style={s.progressHead}>
            <Txt variant="heading" numeric testID="chantier-progress">
              {`${data.progress.measured}/${data.progress.total}`}
            </Txt>
            <Txt variant="caption" tone="muted" style={s.flex}>
              {t.progressLabel}
            </Txt>
            <Txt variant="small" tone="gold" bold>
              {`${dec(ratio * 100, 0)} %`}
            </Txt>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.min(ratio, 1) * 100}%` }]} />
          </View>

          {open && data.my_status === "invited" ? (
            <View style={s.actions}>
              <Button
                testID="chantier-decline"
                label={fr.home.decline}
                variant="secondary"
                compact
                disabled={busy}
                onPress={() => void act(() => declineProjectInvitation(id), onBack)}
                style={s.flex}
              />
              <Button
                testID="chantier-accept"
                label={fr.home.accept}
                compact
                loading={busy}
                onPress={() => void act(() => acceptProjectInvitation(id))}
                style={s.flex}
              />
            </View>
          ) : active && open ? (
            <Button
              testID="chantier-scan"
              label={t.scan}
              onPress={() => onScan({ id: data.id, title: data.title, kind: "chantier" })}
              icon={<ScanLine size={18} color={theme.c.onOlive} strokeWidth={2.3} />}
              style={s.cta}
            />
          ) : !open ? (
            <Txt variant="small" tone="warn">
              {t.closed}
            </Txt>
          ) : null}
        </Card>

        {region ? (
          <View style={s.mapCard}>
            <MapView
              ref={mapRef}
              style={s.map}
              initialRegion={region}
              toolbarEnabled={false}
              showsUserLocation
              testID="chantier-map"
            >
              {polygons.map((coords, i) => (
                <Polygon
                  key={`aac-${i}`}
                  coordinates={coords}
                  strokeColor={theme.c.gold}
                  fillColor="rgba(217,180,74,0.12)"
                  strokeWidth={2.5}
                />
              ))}
              {data.trees
                .filter((tr) => tr.latitude != null && tr.longitude != null)
                .map((tr) => (
                  <Marker
                    key={tr.id}
                    testID={`chantier-marker-${tr.id}`}
                    coordinate={{ latitude: tr.latitude as number, longitude: tr.longitude as number }}
                    title={tr.tree_code}
                    description={tr.species_scientific_name ?? undefined}
                    pinColor={tr.measured_by_me ? MINE : tr.measured ? MEASURED : TO_MEASURE}
                    opacity={focused == null || focused === tr.id ? 1 : 0.55}
                  />
                ))}
            </MapView>
            <View style={s.legend}>
              <Legend color={TO_MEASURE} label={t.legendTodo} />
              <Legend color={MEASURED} label={t.legendDone} />
              <Legend color={MINE} label={t.legendMine} />
            </View>
          </View>
        ) : null}

        <Card>
          <Segmented
            options={[
              { key: "todo", label: t.tabTodo(todo.length) },
              { key: "done", label: t.tabDone(done.length) },
            ]}
            value={tab}
            onChange={setTab}
            testID="chantier-tabs"
          />
          {list.length === 0 ? (
            <Txt variant="small" tone="muted" testID="chantier-list-empty">
              {tab === "todo" ? t.allMeasured : t.noneMeasured}
            </Txt>
          ) : (
            list.map((tr, i) => (
              <View key={tr.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  testID={`chantier-tree-${tr.id}`}
                  onPress={() => focus(tr)}
                  accessibilityRole="button"
                  style={({ pressed }) => [s.treeRow, focused === tr.id && s.treeFocused, pressed && s.pressed]}
                >
                  <View
                    style={[
                      s.dot,
                      { backgroundColor: tr.measured_by_me ? MINE : tr.measured ? MEASURED : TO_MEASURE },
                    ]}
                  />
                  <View style={s.flex}>
                    <Txt variant="small" bold>
                      {tr.tree_code}
                    </Txt>
                    <Txt variant="caption" tone="muted">
                      {[
                        tr.species_scientific_name,
                        tr.measured_dbh_cm != null ? `${dec(tr.measured_dbh_cm)} cm` : null,
                        fr.traceability.registryStatus[tr.status] ?? tr.status,
                        tr.latitude == null ? t.noPosition : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Txt>
                  </View>
                  {tr.measured_by_me ? <Pill tone="info" label={t.byMe} /> : null}
                </Pressable>
              </View>
            ))
          )}
        </Card>

        <Card>
          <View style={s.aacRow}>
            <Users size={16} color={theme.c.olive} />
            <Txt variant="label" tone="muted">
              {t.team(data.team.filter((m) => m.status === "active").length)}
            </Txt>
          </View>
          {data.team.map((m) => (
            <View key={m.user_id} style={s.memberRow} testID={`chantier-member-${m.user_id}`}>
              <Txt variant="small" bold style={s.flex}>
                {personName(m)}
              </Txt>
              {m.status === "invited" ? (
                <Pill tone="gold" label={t.invited} />
              ) : (
                <Txt variant="caption" tone="muted">
                  {t.memberScans(m.scans)}
                </Txt>
              )}
            </View>
          ))}
        </Card>

        {data.my_scans.length ? (
          <Card testID="chantier-my-scans">
            <Txt variant="label" tone="muted">
              {t.myScans}
            </Txt>
            {data.my_scans.map((sc) => (
              <View key={sc.id} style={s.memberRow}>
                <Txt variant="small" style={s.flex}>
                  {[sc.tree_code, sc.species_scientific_name].filter(Boolean).join(" · ") || t.unknownTree}
                </Txt>
                <Txt variant="caption" tone="muted">
                  {[
                    sc.measured_dbh_cm != null ? `${dec(sc.measured_dbh_cm)} cm` : null,
                    new Date(sc.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Txt>
              </View>
            ))}
          </Card>
        ) : null}

        {active ? (
          <Button
            testID="chantier-leave"
            label={t.leave}
            variant="ghost"
            disabled={busy}
            onPress={() => void act(() => leaveProject(id), onBack)}
          />
        ) : null}
        {error ? (
          <Txt variant="small" tone="risk" style={s.center}>
            {t.actionError}
          </Txt>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const s = useStyles();
  return (
    <View style={s.legendItem}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  loader: { flex: 1 },
  flex: { flex: 1 },
  center: { textAlign: "center" },
  aacRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  progressHead: { flexDirection: "row", alignItems: "baseline", gap: th.space.sm, marginTop: th.space.xs },
  track: { height: 6, borderRadius: 3, backgroundColor: th.c.surface2, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: th.c.gold },
  actions: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.sm },
  cta: { marginTop: th.space.sm },
  mapCard: {
    borderRadius: th.radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface,
  },
  map: { height: 260 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: th.space.md, padding: th.space.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  treeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.md,
    paddingVertical: th.space.sm,
    paddingHorizontal: th.space.xs,
    borderRadius: th.radius.sm,
  },
  treeFocused: { backgroundColor: th.c.oliveSoft },
  pressed: { opacity: 0.7 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.xs },
}));
