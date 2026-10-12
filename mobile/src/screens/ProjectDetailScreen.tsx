import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";

import {
  attributeScan,
  AuthUser,
  getProject,
  joinProject,
  leaveProject,
  listMyTrees,
  MyTree,
  ProjectDetail,
} from "../api/client";
import { colors, spacing, type } from "../theme";

interface Props {
  id: number;
  user: AuthUser;
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

export default function ProjectDetailScreen({ id, user, onBack }: Props) {
  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProject(await getProject(id));
    } catch (err) {
      console.error("project detail failed", err);
      setError("Chargement du projet impossible.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const [contributing, setContributing] = React.useState(false);
  const [myTrees, setMyTrees] = React.useState<MyTree[]>([]);
  const [actionBusy, setActionBusy] = React.useState(false);

  const handleJoin = async () => {
    setActionBusy(true);
    try {
      await joinProject(id);
      await load();
    } catch (err) {
      console.error("join failed", err);
    } finally {
      setActionBusy(false);
    }
  };

  const handleLeave = async () => {
    setActionBusy(true);
    try {
      await leaveProject(id);
      await load();
    } catch (err) {
      console.error("leave failed", err);
    } finally {
      setActionBusy(false);
    }
  };

  const toggleContribute = async () => {
    if (!contributing) {
      try {
        setMyTrees(await listMyTrees(200));
      } catch (err) {
        console.error("my trees failed", err);
      }
    }
    setContributing((v) => !v);
  };

  const handleAttribute = async (scanId: number) => {
    setActionBusy(true);
    try {
      await attributeScan(id, scanId);
      setContributing(false);
      await load();
    } catch (err) {
      console.error("attribute failed", err);
    } finally {
      setActionBusy(false);
    }
  };

  const points = (project?.contributions ?? []).filter(
    (c) => c.latitude != null && c.longitude != null,
  );

  const region = React.useMemo(() => {
    if (points.length === 0) return null;
    const lats = points.map((p) => p.latitude as number);
    const lons = points.map((p) => p.longitude as number);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
      latitudeDelta: Math.max(0.05, (Math.max(...lats) - Math.min(...lats)) * 1.6 + 0.02),
      longitudeDelta: Math.max(0.05, (Math.max(...lons) - Math.min(...lons)) * 1.6 + 0.02),
    };
  }, [points]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : error || !project ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? "Projet introuvable."}</Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.link}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{project.title}</Text>
          {project.description ? <Text style={styles.description}>{project.description}</Text> : null}

          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {OBJECTIVE_LABELS[project.objective] ?? project.objective} ·{" "}
              {TARGET_LABELS[project.target_type] ?? project.target_type}
              {project.target_value ? ` · ${project.target_value}` : ""}
            </Text>
            {project.radius_km ? <Text style={styles.meta}>Rayon {project.radius_km} km</Text> : null}
          </View>

          <View style={styles.statsRow}>
            <Stat value={project.scan_count} label="scans" />
            <Stat value={project.species_count} label="espèces" />
            <Stat value={project.contributor_count} label="contributeurs" />
            <Stat value={project.participant_count} label="participants" />
          </View>

          {(user.role === "company" || user.role === "admin") && project.status === "open" && (
            <TouchableOpacity
              style={project.is_participant ? styles.actionBtn : styles.actionBtnPrimary}
              onPress={project.is_participant ? handleLeave : handleJoin}
              disabled={actionBusy}
            >
              <Text style={project.is_participant ? styles.actionText : styles.actionTextPrimary}>
                {project.is_participant ? "Quitter le projet" : "Participer"}
              </Text>
            </TouchableOpacity>
          )}

          {user.role === "operator" && project.status === "open" && (
            <>
              <TouchableOpacity style={styles.actionBtnPrimary} onPress={toggleContribute}>
                <Text style={styles.actionTextPrimary}>
                  {contributing ? "Fermer" : "Contribuer (mes scans)"}
                </Text>
              </TouchableOpacity>
              {contributing &&
                (myTrees.length === 0 ? (
                  <Text style={styles.empty}>Aucun scan à attribuer.</Text>
                ) : (
                  myTrees.map((t) => (
                    <View key={t.id} style={styles.contribution}>
                      <Text style={styles.contributionTitle}>
                        {t.species_scientific_name ?? "Espèce inconnue"}
                      </Text>
                      <Text style={styles.contributionMeta}>
                        DBH {t.measured_dbh_cm ?? "—"} cm ·{" "}
                        {new Date(t.created_at).toLocaleDateString("fr-FR")}
                      </Text>
                      <TouchableOpacity
                        style={styles.attributeBtn}
                        onPress={() => handleAttribute(t.id)}
                        disabled={actionBusy}
                      >
                        <Text style={styles.attributeText}>Attribuer</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                ))}
            </>
          )}

          {region && (
            <MapView style={styles.map} initialRegion={region}>
              {points.map((c) => (
                <Marker
                  key={c.id}
                  coordinate={{ latitude: c.latitude as number, longitude: c.longitude as number }}
                  title={c.species_scientific_name ?? "Espèce inconnue"}
                  description={c.owner_name}
                  pinColor={colors.accent}
                />
              ))}
            </MapView>
          )}

          <Text style={styles.sectionTitle}>Contributions</Text>
          {project.contributions.length === 0 ? (
            <Text style={styles.empty}>Aucune contribution pour l'instant.</Text>
          ) : (
            project.contributions.map((c) => (
              <View key={c.id} style={styles.contribution}>
                <Text style={styles.contributionTitle}>
                  {c.species_scientific_name ?? "Espèce inconnue"}
                </Text>
                <Text style={styles.contributionMeta}>
                  {c.owner_name} · DBH {c.measured_dbh_cm ?? "—"} cm ·{" "}
                  {new Date(c.created_at).toLocaleDateString("fr-FR")}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  error: { color: colors.error, fontSize: type.body },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700", marginTop: spacing.sm },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: type.title, fontWeight: "800" },
  description: { color: colors.textDim, fontSize: type.body },
  metaRow: { gap: spacing.xs },
  meta: { color: colors.accent, fontSize: type.body, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    alignItems: "center",
  },
  statValue: { color: colors.text, fontSize: type.heading, fontWeight: "800" },
  statLabel: { color: colors.textDim, fontSize: type.caption, textTransform: "uppercase" },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  actionBtnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  actionText: { color: colors.textDim, fontSize: type.body, fontWeight: "700" },
  actionTextPrimary: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  attributeBtn: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  attributeText: { color: colors.accent, fontSize: type.caption, fontWeight: "800" },
  map: { height: 200, borderRadius: 12 },
  sectionTitle: { color: colors.accent, fontSize: type.caption, fontWeight: "800", textTransform: "uppercase" },
  empty: { color: colors.textDim, fontSize: type.body },
  contribution: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  contributionTitle: { color: colors.text, fontSize: type.body, fontWeight: "700", fontStyle: "italic" },
  contributionMeta: { color: colors.textDim, fontSize: type.caption },
});
