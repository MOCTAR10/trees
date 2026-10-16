import * as Location from "expo-location";
import { Recycle } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Switch, View } from "react-native";

import {
  AuthUser,
  collectResidue,
  cooperativeResidues,
  NearbyResidue,
} from "../api/client";
import RoleHeader from "../components/RoleHeader";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, EmptyState, Pill, PillTone, Segmented, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

interface Props {
  user: AuthUser;
  onLogout: () => void;
  showHeader?: boolean;
}

const DEFAULT_COORDS = { latitude: 0.4162, longitude: 9.4541 };
const RADIUS_KM = 150;
const RADII = ["50", "150", "1000"] as const;
type Radius = (typeof RADII)[number];

const STATUS_TONE: Record<string, PillTone> = {
  available: "ok",
  allocated: "gold",
  collected: "neutral",
};

export default function CooperativeScreen({ showHeader = true }: Props) {
  const t = useTheme();
  const s = useStyles();
  const [coords, setCoords] = useState(DEFAULT_COORDS);
  const [residues, setResidues] = useState<NearbyResidue[]>([]);
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [radius, setRadius] = useState<Radius>("150");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (lat: number, lon: number, matching: boolean, km: number = RADIUS_KM) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await cooperativeResidues(lat, lon, {
        radiusKm: km,
        onlyMatching: matching,
      });
      setResidues(resp.residues);
    } catch (err) {
      console.error("cooperative load failed", err);
      setError(fr.cooperative.error);
    } finally {
      setLoading(false);
    }
  }, []);

  const locate = useCallback(async () => {
    let next = coords;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCoords(next);
      }
    } catch (err) {
      console.error("location failed", err);
    }
    await load(next.latitude, next.longitude, onlyMatching, Number(radius));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, onlyMatching, load, radius]);

  useEffect(() => {
    load(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude, false);
  }, [load]);

  const toggleMatching = async (value: boolean) => {
    setOnlyMatching(value);
    await load(coords.latitude, coords.longitude, value, Number(radius));
  };

  const changeRadius = async (value: Radius) => {
    setRadius(value);
    await load(coords.latitude, coords.longitude, onlyMatching, Number(value));
  };

  const collect = async (id: number) => {
    try {
      await collectResidue(id);
      await load(coords.latitude, coords.longitude, onlyMatching, Number(radius));
    } catch (err) {
      console.error("collect failed", err);
      setError(fr.cooperative.error);
    }
  };

  const reload = () => void load(coords.latitude, coords.longitude, onlyMatching, Number(radius));

  return (
    <View style={s.container}>
      {showHeader && <RoleHeader title={fr.cooperative.title} subtitle={fr.cooperative.subtitle} />}

      <View style={s.top}>
        <Card style={s.intro}>
          <View style={s.introRow}>
            <View style={s.introIcon}>
              <Recycle size={20} color={t.c.onOlive} strokeWidth={2.2} />
            </View>
            <Txt variant="heading" style={s.flex}>
              {fr.cooperative.introTitle}
            </Txt>
          </View>
          <Txt variant="small" tone="muted">
            {fr.cooperative.intro(Number(radius))}
          </Txt>
        </Card>
        <Segmented
          testID="coop-radius"
          options={RADII.map((key) => ({ key, label: fr.cooperative.radius(Number(key)) }))}
          value={radius}
          onChange={(key) => void changeRadius(key)}
        />
        <View style={s.controls}>
          <Button label={fr.cooperative.locate} variant="secondary" compact onPress={() => void locate()} />
          <View style={s.switchRow}>
            <Txt variant="small" tone="muted">
              {fr.cooperative.onlyMatching}
            </Txt>
            <Switch
              value={onlyMatching}
              onValueChange={toggleMatching}
              trackColor={{ true: t.c.olive, false: t.c.line }}
              thumbColor={t.c.surface}
            />
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={s.center} color={t.c.olive} />
      ) : error ? (
        <EmptyState message={error} tone="risk" action={{ label: fr.common.retry, onPress: reload }} />
      ) : residues.length === 0 ? (
        <View style={s.center}>
          <Txt variant="heading" style={s.centerText}>
            {fr.cooperative.empty}
          </Txt>
          <Txt tone="muted" style={s.centerText}>
            {fr.cooperative.emptyHint}
          </Txt>
          <Button label={fr.cooperative.refresh} variant="secondary" compact onPress={reload} />
        </View>
      ) : (
        <FlatList
          data={residues}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <Txt variant="label" tone="gold">
              {fr.cooperative.count(residues.length)}
            </Txt>
          }
          renderItem={({ item }) => (
            <Card style={s.card}>
              <View style={s.cardTop}>
                <Txt bold style={[s.flex, s.species]} numberOfLines={1}>
                  {item.species_scientific_name ?? "—"}
                </Txt>
                <Txt variant="small" tone="muted" numeric>
                  {fr.cooperative.distance(item.distance_km)}
                </Txt>
              </View>
              <Txt variant="small" tone="muted">
                {fr.cooperative.relevant(item.relevant_mass_kg)} · {fr.cooperative.match(item.match_score)}
              </Txt>
              <View style={s.pills}>
                <Pill label={fr.company.status[item.status] ?? item.status} tone={STATUS_TONE[item.status] ?? "neutral"} />
                {item.assigned_to_me ? <Pill label={fr.cooperative.mine} tone="info" /> : null}
              </View>
              {item.assigned_to_me && item.status === "allocated" ? (
                <Button label={fr.cooperative.collect} onPress={() => void collect(item.id)} />
              ) : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.c.bg },
  top: { paddingHorizontal: t.space.lg, paddingTop: t.space.md, gap: t.space.sm },
  intro: { gap: t.space.xs },
  introRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  introIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: t.c.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: t.space.sm,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm, flexShrink: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.md, padding: t.space.xl },
  centerText: { textAlign: "center" },
  list: { padding: t.space.lg, gap: t.space.sm },
  card: { gap: t.space.xs },
  cardTop: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
  species: { fontStyle: "italic" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: t.space.xs },
}));
