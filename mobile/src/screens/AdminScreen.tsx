import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { adminStats, AdminStats, AuthUser } from "../api/client";
import RoleHeader from "../components/RoleHeader";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

interface Props {
  user: AuthUser;
  onLogout: () => void;
}

export default function AdminScreen({ user, onLogout }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await adminStats());
    } catch (err) {
      console.error("admin load failed", err);
      setError(fr.admin.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cells: { label: string; value: string }[] = stats
    ? [
        { label: fr.admin.users, value: String(stats.users) },
        { label: fr.admin.cooperatives, value: String(stats.cooperatives) },
        { label: fr.admin.scans, value: String(stats.scans) },
        { label: fr.admin.residues, value: String(stats.residues) },
        { label: fr.admin.available, value: String(stats.residues_available) },
        { label: fr.admin.allocated, value: String(stats.residues_allocated) },
        { label: fr.admin.collected, value: String(stats.residues_collected) },
        { label: fr.admin.waste, value: `${Math.round(stats.waste_kg)} kg` },
      ]
    : [];

  return (
    <View style={styles.container}>
      <RoleHeader
        title={fr.admin.title}
        subtitle={fr.admin.subtitle}
        roleLabel={`${fr.roles.admin} · ${user.display_name}`}
        onLogout={onLogout}
      />

      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.link}>{fr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {cells.map((cell) => (
            <View key={cell.label} style={styles.cell}>
              <Text style={styles.cellValue}>{cell.value}</Text>
              <Text style={styles.cellLabel}>{cell.label}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  error: { color: colors.error, fontSize: type.body },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: spacing.md,
    gap: spacing.sm,
  },
  cell: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cellValue: { color: colors.text, fontSize: type.heading, fontWeight: "800" },
  cellLabel: { color: colors.textDim, fontSize: type.caption },
});
