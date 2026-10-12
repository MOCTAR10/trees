import React from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { getDiagnostics, DiagnosticFlagged } from "../api/client";
import RoleHeader from "../components/RoleHeader";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

interface Props {
  onBack?: () => void;
  showHeader?: boolean;
}

export default function DiagnosticScreen({ onBack, showHeader = false }: Props) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getDiagnostics());
    } catch (err) {
      console.error("diagnostics failed", err);
      setError("Impossible de charger le diagnostic");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const healthEntries = Object.entries(data?.by_health ?? {});

  return (
    <View style={styles.container}>
      {showHeader && (
        <RoleHeader title="Diagnostic" subtitle="Synthèse d'anomalies sur vos analyses" />
      )}
      {onBack && !showHeader && (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.link}>← Retour</Text>
          </TouchableOpacity>
        </View>
      )}
      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={data.flagged}
          ListHeaderComponent={
            <View style={styles.content}>
              <View style={styles.card}>
                <Text style={styles.kpi}>{data.total}</Text>
                <Text style={styles.kpiLabel}>Analyses ({data.scope})</Text>
              </View>
              <View style={styles.grid}>
                <View style={styles.smallCard}>
                  <Text style={styles.value}>{data.anomalies}</Text>
                  <Text style={styles.label}>Anomalies santé</Text>
                </View>
                <View style={styles.smallCard}>
                  <Text style={styles.value}>{data.unidentified}</Text>
                  <Text style={styles.label}>Non identifiées</Text>
                </View>
                <View style={styles.smallCard}>
                  <Text style={styles.value}>{data.low_confidence}</Text>
                  <Text style={styles.label}>Faible confiance</Text>
                </View>
                <View style={styles.smallCard}>
                  <Text style={styles.value}>{data.missing_dbh}</Text>
                  <Text style={styles.label}>DBH manquant</Text>
                </View>
              </View>
              {healthEntries.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.section}>Répartition par état sanitaire</Text>
                  {healthEntries.map(([k, v]) => (
                    <Text key={k} style={styles.meta}>
                      {String(k)}: {String(v)}
                    </Text>
                  ))}
                </View>
              )}
              <Text style={styles.section}>Éléments signalés</Text>
            </View>
          }
          keyExtractor={(f: DiagnosticFlagged) => String(f.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.flagged}>
              <Text style={styles.scientific}>{item.species_scientific_name ?? "Espèce inconnue"}</Text>
              <Text style={styles.meta}>
                ID #{item.id} · {item.health_status ?? "santé inconnue"} · conf{" "}
                {String((item.species_confidence ?? 0).toFixed(2))} · DBH {item.measured_dbh_cm ?? "—"} cm
              </Text>
              <Text style={styles.reasons}>{String((item.reasons ?? []).join(", "))}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  error: { color: colors.error, fontSize: type.body },
  content: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
  },
  kpi: { color: colors.text, fontSize: 40, fontWeight: "800" },
  kpiLabel: { color: colors.textDim, fontSize: type.caption, textTransform: "uppercase" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  smallCard: {
    flexBasis: "48%",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
  },
  value: { color: colors.text, fontSize: type.heading, fontWeight: "700" },
  label: { color: colors.textDim, fontSize: type.caption, textAlign: "center" },
  section: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  flagged: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  scientific: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  meta: { color: colors.textDim, fontSize: type.caption },
  reasons: { color: colors.warning, fontSize: type.caption, fontWeight: "600" },
});
