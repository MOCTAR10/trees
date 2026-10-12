import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  adminStats,
  AdminStats,
  AnomalyLine,
  AuthUser,
  decideDeclaration,
  Declaration,
  DeclarationLine,
  getDeclaration,
  listAnomalies,
  listDeclarations,
} from "../api/client";
import AdminUsers from "../components/AdminUsers";
import AdminDocuments from "../components/AdminDocuments";
import AdminTitles from "../components/AdminTitles";
import AdminTraceability from "../components/AdminTraceability";
import AdminFiscal from "../components/AdminFiscal";
import AdminCertifications from "../components/AdminCertifications";
import DeclarationCompliance from "../components/DeclarationCompliance";
import RoleHeader from "../components/RoleHeader";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

interface Props {
  user: AuthUser;
  onLogout: () => void;
  showHeader?: boolean;
}

type Tab = "stats" | "users" | "declarations" | "anomalies" | "documents" | "titres" | "tracabilite" | "fiscal" | "cert";

export default function AdminScreen({ user, onLogout, showHeader = true }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("stats");

  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [declLoading, setDeclLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lines, setLines] = useState<Record<number, DeclarationLine[]>>({});
  const [motif, setMotif] = useState("");
  const [deciding, setDeciding] = useState(false);

  const [anomalies, setAnomalies] = useState<{
    below_dme_authorized: AnomalyLine[];
    felled_without_authorization: AnomalyLine[];
  } | null>(null);
  const [anomLoading, setAnomLoading] = useState(false);

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

  const loadDeclarations = useCallback(async () => {
    setDeclLoading(true);
    try {
      setDeclarations(await listDeclarations());
    } catch (err) {
      console.error("declarations load failed", err);
    } finally {
      setDeclLoading(false);
    }
  }, []);

  const loadAnomalies = useCallback(async () => {
    setAnomLoading(true);
    try {
      setAnomalies(await listAnomalies());
    } catch (err) {
      console.error("anomalies load failed", err);
    } finally {
      setAnomLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "declarations") void loadDeclarations();
    if (tab === "anomalies") void loadAnomalies();
  }, [tab, loadDeclarations, loadAnomalies]);

  const toggle = async (id: number) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!lines[id]) {
      try {
        const detail = await getDeclaration(id);
        setLines((prev) => ({ ...prev, [id]: detail.lines }));
      } catch (err) {
        console.error("declaration detail failed", err);
      }
    }
  };

  const decide = async (id: number, decision: "autorisee" | "rejetee") => {
    if (decision === "rejetee" && !motif.trim()) return;
    setDeciding(true);
    try {
      await decideDeclaration(id, decision, motif.trim() || null);
      setMotif("");
      setExpanded(null);
      await loadDeclarations();
    } catch (err) {
      console.error("decision failed", err);
    } finally {
      setDeciding(false);
    }
  };

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

  const tabs: { key: Tab; label: string }[] = [
    { key: "stats", label: fr.admin.tabStats },
    { key: "users", label: fr.admin.tabUsers },
    { key: "declarations", label: fr.felling.tabDeclarations },
    { key: "anomalies", label: fr.felling.tabAnomalies },
    { key: "documents", label: fr.docs.tab },
    { key: "titres", label: fr.titles.tab },
    { key: "tracabilite", label: fr.traceability.tab },
    { key: "fiscal", label: fr.fiscal.tab },
    { key: "cert", label: fr.cert.tab },
  ];

  return (
    <View style={styles.container}>
      {showHeader && <RoleHeader title={fr.admin.title} subtitle={fr.admin.subtitle} />}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabs}
        contentContainerStyle={styles.tabsContent}
      >
        {tabs.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === "users" ? (
        <AdminUsers />
      ) : tab === "documents" ? (
        <AdminDocuments />
      ) : tab === "titres" ? (
        <AdminTitles />
      ) : tab === "tracabilite" ? (
        <AdminTraceability />
      ) : tab === "fiscal" ? (
        <AdminFiscal />
      ) : tab === "cert" ? (
        <AdminCertifications />
      ) : tab === "declarations" ? (
        declLoading ? (
          <ActivityIndicator style={styles.center} color={colors.accent} />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {declarations.length === 0 ? (
              <Text style={styles.dim}>{fr.felling.noDeclarations}</Text>
            ) : null}
            {declarations.map((d) => (
              <View key={d.id} style={styles.card}>
                <TouchableOpacity onPress={() => void toggle(d.id)}>
                  <Text style={styles.cardTitle}>
                    {fr.felling.declarationId(d.id)} · {d.permit_type} {d.permit_number}
                  </Text>
                  <Text style={styles.meta}>
                    {fr.felling.status[d.status]} · {d.line_count ?? 0} pieds
                    {d.aac_label ? ` · ${d.aac_label}` : ""}
                  </Text>
                  {d.decision_motif ? <Text style={styles.meta}>{d.decision_motif}</Text> : null}
                </TouchableOpacity>
                {expanded === d.id ? (
                  <View style={styles.detail}>
                    {(lines[d.id] ?? []).map((l) => (
                      <View key={l.id} style={styles.line}>
                        <Text style={styles.code}>{l.tree_code}</Text>
                        <Text style={styles.meta}>
                          {l.species_scientific_name ?? "—"}
                          {l.measured_dbh_cm != null ? ` · ${l.measured_dbh_cm} cm` : ""}
                          {l.dme_cm != null ? ` (DME ${l.dme_cm})` : ""}
                        </Text>
                        {l.violations.length > 0 ? (
                          <Text style={styles.warn}>
                            {l.violations
                              .map((v) => fr.felling.violation[v as keyof typeof fr.felling.violation] ?? v)
                              .join(" · ")}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                    <DeclarationCompliance declarationId={d.id} />
                    {d.status === "soumise" ? (
                      <>
                        <TextInput
                          style={styles.input}
                          value={expanded === d.id ? motif : ""}
                          onChangeText={setMotif}
                          placeholder={fr.felling.motif}
                          placeholderTextColor={colors.textDim}
                        />
                        <View style={styles.decideRow}>
                          <TouchableOpacity
                            style={[styles.decide, styles.approve]}
                            disabled={deciding}
                            onPress={() => void decide(d.id, "autorisee")}
                          >
                            <Text style={styles.decideText}>{fr.felling.approve}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.decide, styles.reject]}
                            disabled={deciding}
                            onPress={() => void decide(d.id, "rejetee")}
                          >
                            <Text style={styles.decideText}>{fr.felling.reject}</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )
      ) : tab === "anomalies" ? (
        anomLoading || !anomalies ? (
          <ActivityIndicator style={styles.center} color={colors.accent} />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <Text style={styles.section}>{fr.felling.belowDmeTitle}</Text>
            {anomalies.below_dme_authorized.length === 0 ? (
              <Text style={styles.dim}>{fr.felling.noAnomalies}</Text>
            ) : (
              anomalies.below_dme_authorized.map((a, i) => (
                <View key={`${a.tree_code}-${i}`} style={styles.card}>
                  <Text style={styles.code}>{a.tree_code}</Text>
                  <Text style={styles.meta}>
                    {a.species_scientific_name ?? "—"} · {a.measured_dbh_cm ?? "—"} cm
                    (DME {a.dme_cm ?? "—"})
                  </Text>
                </View>
              ))
            )}
            <Text style={styles.section}>{fr.felling.wildTitle}</Text>
            {anomalies.felled_without_authorization.length === 0 ? (
              <Text style={styles.dim}>{fr.felling.noAnomalies}</Text>
            ) : (
              anomalies.felled_without_authorization.map((a, i) => (
                <View key={`${a.tree_code}-${i}`} style={[styles.card, styles.dangerCard]}>
                  <Text style={styles.code}>{a.tree_code}</Text>
                </View>
              ))
            )}
          </ScrollView>
        )
      ) : loading ? (
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
  tabs: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexGrow: 0,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  tab: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
  },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.textDim, fontSize: type.caption, fontWeight: "600" },
  tabTextActive: { color: colors.primary, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  error: { color: colors.error, fontSize: type.body },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  dim: { color: colors.textDim, fontSize: type.body, textAlign: "center", marginTop: spacing.lg },
  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  dangerCard: { borderColor: colors.error },
  cardTitle: { color: colors.text, fontSize: type.body, fontWeight: "800" },
  code: { color: colors.text, fontSize: type.body, fontWeight: "800" },
  meta: { color: colors.textDim, fontSize: type.caption },
  warn: { color: colors.warning, fontSize: type.caption, fontWeight: "700" },
  section: {
    color: colors.accent,
    fontSize: type.body,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  detail: { gap: spacing.sm, marginTop: spacing.sm },
  line: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: spacing.sm,
    gap: 2,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: type.body,
  },
  decideRow: { flexDirection: "row", gap: spacing.sm },
  decide: { flex: 1, borderRadius: 8, paddingVertical: spacing.sm, alignItems: "center" },
  approve: { backgroundColor: colors.success },
  reject: { backgroundColor: colors.error },
  decideText: { color: "#FFFFFF", fontSize: type.body, fontWeight: "800" },
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
