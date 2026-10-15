import React from "react";
import {
  ActivityIndicator,
  ScrollView,
    Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { makeStyles, useTheme } from "../design/ThemeProvider";

import {
  attributeScan,
  AuthUser,
  getProject,
  acceptProjectInvitation,
  declineProjectInvitation,
  inviteToProject,
  joinProject,
  leaveProject,
  listMyTrees,
  MyTree,
  ProjectDetail,
} from "../api/client";

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
  const styles = useStyles();
  const theme = useTheme();
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

  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteNote, setInviteNote] = React.useState<string | null>(null);

  const runAction = async (action: () => Promise<unknown>) => {
    setActionBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      console.error("project action failed", err);
    } finally {
      setActionBusy(false);
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setActionBusy(true);
    setInviteNote(null);
    try {
      await inviteToProject(id, [email]);
      setInviteEmail("");
      setInviteNote(`Invitation envoyée à ${email}`);
      await load();
    } catch {
      setInviteNote("Compte introuvable ou invitation impossible.");
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
        <ActivityIndicator style={styles.center} color={theme.c.olive} />
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

          <Text style={styles.contributionMeta}>
            {project.kind === "chantier"
              ? `Chantier${project.aac_label ? ` · ${project.aac_label}` : ""}${
                  project.registry_trees ? ` · ${project.registry_scanned ?? 0}/${project.registry_trees} tiges mesurées` : ""
                }`
              : "Projet ouvert (participatif)"}
            {project.participation === "invitation" ? " · sur invitation" : " · ouvert à tous"}
          </Text>

          {project.status === "open" && project.my_status === "invited" ? (
            <View style={styles.statsRow}>
              <TouchableOpacity
                testID="project-decline"
                style={styles.actionBtn}
                onPress={() => runAction(() => declineProjectInvitation(id))}
                disabled={actionBusy}
              >
                <Text style={styles.actionText}>Refuser</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="project-accept"
                style={styles.actionBtnPrimary}
                onPress={() => runAction(() => acceptProjectInvitation(id))}
                disabled={actionBusy}
              >
                <Text style={styles.actionTextPrimary}>Accepter l'invitation</Text>
              </TouchableOpacity>
            </View>
          ) : project.status === "open" && (project.is_participant || project.participation !== "invitation") ? (
            <TouchableOpacity
              testID="project-join-toggle"
              style={project.is_participant ? styles.actionBtn : styles.actionBtnPrimary}
              onPress={project.is_participant ? handleLeave : handleJoin}
              disabled={actionBusy}
            >
              <Text style={project.is_participant ? styles.actionText : styles.actionTextPrimary}>
                {project.is_participant ? "Quitter le projet" : "Participer"}
              </Text>
            </TouchableOpacity>
          ) : null}

          {project.participants ? (
            <View style={styles.contribution}>
              <Text style={styles.contributionTitle}>Inviter un participant (e-mail)</Text>
              <TextInput
                testID="project-invite-email"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="agent@exemple.ga"
                placeholderTextColor={theme.c.muted}
                style={styles.inviteInput}
              />
              <TouchableOpacity testID="project-invite" style={styles.attributeBtn} onPress={handleInvite} disabled={actionBusy}>
                <Text style={styles.attributeText}>Inviter</Text>
              </TouchableOpacity>
              {inviteNote ? <Text style={styles.contributionMeta}>{inviteNote}</Text> : null}
              {project.participants.map((pp) => (
                <Text key={pp.user_id} style={styles.contributionMeta}>
                  {`${[pp.first_name, pp.last_name].filter(Boolean).join(" ") || pp.display_name} · ${
                    pp.status === "active" ? "participe" : pp.status === "invited" ? "invité" : "a refusé"
                  }`}
                </Text>
              ))}
            </View>
          ) : null}

          {user.role === "operator" && project.status === "open" && project.is_participant && (
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
                  pinColor={theme.c.olive}
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
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  container: { flex: 1, backgroundColor: th.c.bg },
  topBar: { padding: th.space.lg, borderBottomWidth: 1, borderBottomColor: th.c.line },
  back: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.sm, padding: th.space.xl },
  error: { color: th.c.risk, fontSize: 15, fontFamily: th.fonts.body },
  link: { color: th.c.olive, fontSize: 15, marginTop: th.space.sm, fontFamily: th.fonts.bodyBold },
  content: { padding: th.space.lg, gap: th.space.lg, paddingBottom: th.space.xxl },
  title: { color: th.c.ink, fontSize: 26, fontFamily: th.fonts.display },
  description: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body },
  metaRow: { gap: th.space.xs },
  meta: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  statsRow: { flexDirection: "row", gap: th.space.sm },
  stat: {
    flex: 1,
    backgroundColor: th.c.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.sm,
    alignItems: "center",
  },
  statValue: { color: th.c.ink, fontSize: 20, fontFamily: th.fonts.display },
  statLabel: { color: th.c.muted, fontSize: 12, textTransform: "uppercase", fontFamily: th.fonts.body },
  actionBtn: {
    borderWidth: 1,
    borderColor: th.c.line,
    borderRadius: 10,
    paddingVertical: th.space.sm,
    alignItems: "center",
  },
  actionBtnPrimary: {
    backgroundColor: th.c.olive,
    borderRadius: 10,
    paddingVertical: th.space.sm,
    alignItems: "center",
  },
  actionText: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.bodyBold },
  actionTextPrimary: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  attributeBtn: {
    backgroundColor: th.c.surface2,
    borderRadius: 8,
    paddingVertical: th.space.sm,
    alignItems: "center",
    marginTop: th.space.xs,
  },
  attributeText: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
  inviteInput: {
    backgroundColor: th.c.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: th.c.line,
    color: th.c.ink,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    marginTop: th.space.xs,
  },
  map: { height: 200, borderRadius: 12 },
  sectionTitle: { color: th.c.olive, fontSize: 12, textTransform: "uppercase", fontFamily: th.fonts.bodyBold },
  empty: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body },
  contribution: {
    backgroundColor: th.c.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  contributionTitle: { color: th.c.ink, fontSize: 15, fontStyle: "italic", fontFamily: th.fonts.bodyBold },
  contributionMeta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
}));
