import React from "react";
import {
  ActivityIndicator,
  FlatList,
    Text,
  TouchableOpacity,
  View,
} from "react-native";

import { AuthUser, listProjects, Project } from "../api/client";
import { makeStyles, useTheme } from "../design/ThemeProvider";

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
  const styles = useStyles();
  const theme = useTheme();
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
        <ActivityIndicator style={styles.center} color={theme.c.olive} />
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

const useStyles = makeStyles((th) => ({
  container: { flex: 1, backgroundColor: th.c.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: th.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  back: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  title: { color: th.c.ink, fontSize: 20, flexShrink: 1, fontFamily: th.fonts.display },
  create: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  spacer: { width: 70 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.sm, padding: th.space.xl },
  error: { color: th.c.risk, fontSize: 15, fontFamily: th.fonts.body },
  link: { color: th.c.olive, fontSize: 15, marginTop: th.space.sm, fontFamily: th.fonts.bodyBold },
  empty: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body },
  list: { padding: th.space.lg, gap: th.space.sm },
  card: {
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: th.space.sm },
  cardTitle: { color: th.c.ink, fontSize: 15, flexShrink: 1, fontFamily: th.fonts.bodyBold },
  statusBadge: { borderRadius: 6, paddingHorizontal: th.space.sm, paddingVertical: 2, backgroundColor: th.c.muted },
  statusOpen: { backgroundColor: th.c.ok },
  statusText: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold },
  cardMeta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  cardStats: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
}));
