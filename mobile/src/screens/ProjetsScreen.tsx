import React from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { AuthUser, listProjects, Project } from "../api/client";
import { colors, spacing, type } from "../theme";

interface Props {
  user: AuthUser;
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
  onBack: () => void;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  cartographie: "Cartographie",
  inventaire: "Inventaire",
  sante: "Santé",
  restauration: "Restauration",
  autre: "Autre",
};

const TARGET_LABELS: Record<string, string> = {
  species: "Espèce",
  family: "Famille",
  genus: "Genre",
  all: "Tout",
};

export default function ProjetsScreen({ user, onOpenProject, onCreateProject, onBack }: Props) {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await listProjects());
    } catch (err) {
      console.error("projects failed", err);
      setError("Chargement des projets impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const canCreate = user.role === "admin" || user.role === "company";

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Projets</Text>
        {canCreate ? (
          <TouchableOpacity onPress={onCreateProject} accessibilityRole="button">
            <Text style={styles.create}>+ Nouveau</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.link}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Aucun projet pour l'instant.</Text>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => onOpenProject(item)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={[styles.statusBadge, item.status === "open" && styles.statusOpen]}>
                  <Text style={styles.statusText}>
                    {item.status === "open" ? "Ouvert" : item.status === "closed" ? "Clôturé" : "Brouillon"}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>
                {OBJECTIVE_LABELS[item.objective] ?? item.objective} ·{" "}
                {TARGET_LABELS[item.target_type] ?? item.target_type}
                {item.target_value ? ` · ${item.target_value}` : ""}
              </Text>
              <Text style={styles.cardStats}>
                {item.scan_count} scan{item.scan_count > 1 ? "s" : ""} · {item.participant_count}{" "}
                participant{item.participant_count > 1 ? "s" : ""}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  title: { color: colors.text, fontSize: type.heading, fontWeight: "800", flexShrink: 1 },
  create: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  spacer: { width: 70 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  error: { color: colors.error, fontSize: type.body },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700", marginTop: spacing.sm },
  empty: { color: colors.textDim, fontSize: type.body },
  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  cardTitle: { color: colors.text, fontSize: type.body, fontWeight: "700", flexShrink: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: 2, backgroundColor: colors.textDim },
  statusOpen: { backgroundColor: colors.success },
  statusText: { color: colors.text, fontSize: type.caption, fontWeight: "800" },
  cardMeta: { color: colors.textDim, fontSize: type.caption },
  cardStats: { color: colors.accent, fontSize: type.caption, fontWeight: "700" },
});
