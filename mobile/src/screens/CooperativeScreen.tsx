import * as Location from "expo-location";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  AuthUser,
  collectResidue,
  cooperativeResidues,
  NearbyResidue,
} from "../api/client";
import RoleHeader from "../components/RoleHeader";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

interface Props {
  user: AuthUser;
  onLogout: () => void;
}

const DEFAULT_COORDS = { latitude: 0.4162, longitude: 9.4541 };
const RADIUS_KM = 150;

export default function CooperativeScreen({ user, onLogout }: Props) {
  const [coords, setCoords] = useState(DEFAULT_COORDS);
  const [residues, setResidues] = useState<NearbyResidue[]>([]);
  const [profileType, setProfileType] = useState<string | null>(null);
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (lat: number, lon: number, matching: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await cooperativeResidues(lat, lon, {
        radiusKm: RADIUS_KM,
        onlyMatching: matching,
      });
      setResidues(resp.residues);
      setProfileType(resp.profile_type);
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
    await load(next.latitude, next.longitude, onlyMatching);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, onlyMatching, load]);

  useEffect(() => {
    load(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude, false);
  }, [load]);

  const toggleMatching = async (value: boolean) => {
    setOnlyMatching(value);
    await load(coords.latitude, coords.longitude, value);
  };

  const collect = async (id: number) => {
    try {
      await collectResidue(id);
      await load(coords.latitude, coords.longitude, onlyMatching);
    } catch (err) {
      console.error("collect failed", err);
      setError(fr.cooperative.error);
    }
  };

  return (
    <View style={styles.container}>
      <RoleHeader
        title={fr.cooperative.title}
        subtitle={fr.cooperative.subtitle}
        roleLabel={`${fr.roles.cooperative} · ${user.display_name}${
          profileType ? ` · ${profileType}` : ""
        }`}
        onLogout={onLogout}
      />

      <View style={styles.controls}>
        <TouchableOpacity onPress={locate} style={styles.locateBtn}>
          <Text style={styles.locateText}>{fr.cooperative.locate}</Text>
        </TouchableOpacity>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{fr.cooperative.onlyMatching}</Text>
          <Switch
            value={onlyMatching}
            onValueChange={toggleMatching}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={() => load(coords.latitude, coords.longitude, onlyMatching)}>
            <Text style={styles.link}>{fr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : residues.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.dim}>{fr.cooperative.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={residues}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.species}>{item.species_scientific_name ?? "—"}</Text>
                <Text style={styles.distance}>{fr.cooperative.distance(item.distance_km)}</Text>
              </View>
              <Text style={styles.meta}>
                {fr.cooperative.relevant(item.relevant_mass_kg)} · {fr.cooperative.match(item.match_score)}
              </Text>
              <Text style={styles.status}>{fr.company.status[item.status]}</Text>
              {item.assigned_to_me ? (
                <Text style={styles.mine}>{fr.cooperative.mine}</Text>
              ) : null}
              {item.assigned_to_me && item.status === "allocated" ? (
                <TouchableOpacity style={styles.action} onPress={() => collect(item.id)}>
                  <Text style={styles.actionText}>{fr.cooperative.collect}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  locateBtn: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  locateText: { color: colors.text, fontSize: type.caption, fontWeight: "700" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  switchLabel: { color: colors.textDim, fontSize: type.caption },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  dim: { color: colors.textDim, fontSize: type.body },
  error: { color: colors.error, fontSize: type.body },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  species: { color: colors.text, fontSize: type.body, fontWeight: "700", fontStyle: "italic", flex: 1 },
  distance: { color: colors.textDim, fontSize: type.caption },
  meta: { color: colors.textDim, fontSize: type.caption },
  status: { color: colors.text, fontSize: type.caption, fontWeight: "600" },
  mine: { color: colors.success, fontSize: type.caption, fontWeight: "700" },
  action: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  actionText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
});
