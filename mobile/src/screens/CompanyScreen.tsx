import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  allocateResidue,
  AuthUser,
  CompanyResidue,
  Cooperation,
  companyResidues,
  Declaration,
  listCooperatives,
  listDeclarations,
  releaseResidue,
} from "../api/client";
import RoleHeader from "../components/RoleHeader";
import { fr } from "../i18n/fr";
import { exportDeclarationPlatesPdf, sharePdf } from "../pdf";
import { colors, spacing, type } from "../theme";
import CompanyTitles from "../components/CompanyTitles";
import CompanyTraceability from "../components/CompanyTraceability";
import CompanyFiscal from "../components/CompanyFiscal";
import CompanyCertifications from "../components/CompanyCertifications";
import OrgDocuments from "../components/OrgDocuments";
import OrgTaxes from "../components/OrgTaxes";
import CustodyScreen from "./CustodyScreen";
import DeclareScreen from "./DeclareScreen";

interface Props {
  user: AuthUser;
  onLogout: () => void;
  showHeader?: boolean;
}

type CompanyTab = "residues" | "abattage" | "grumes" | "documents" | "titres" | "taxes" | "tracabilite" | "fiscal" | "cert";

export default function CompanyScreen({ user, onLogout, showHeader = true }: Props) {
  const [residues, setResidues] = useState<CompanyResidue[]>([]);
  const [cooperatives, setCooperatives] = useState<Cooperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<CompanyResidue | null>(null);
  const [tab, setTab] = useState<CompanyTab>("residues");
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [platesBusy, setPlatesBusy] = useState<number | null>(null);

  const printPlates = async (declarationId: number) => {
    setPlatesBusy(declarationId);
    try {
      await sharePdf(await exportDeclarationPlatesPdf(declarationId));
    } catch (err) {
      console.error("plates export failed", err);
    } finally {
      setPlatesBusy(null);
    }
  };
  const [declLoading, setDeclLoading] = useState(false);
  const [declError, setDeclError] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState(false);

  const loadDeclarations = useCallback(async () => {
    setDeclLoading(true);
    setDeclError(null);
    try {
      setDeclarations(await listDeclarations());
    } catch (err) {
      console.error("declarations load failed", err);
      setDeclError(fr.felling.error);
    } finally {
      setDeclLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "abattage" && !declaring) void loadDeclarations();
  }, [tab, declaring, loadDeclarations]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [residuesData, coopsData] = await Promise.all([
        companyResidues(),
        listCooperatives(),
      ]);
      setResidues(residuesData);
      setCooperatives(coopsData);
    } catch (err) {
      console.error("company load failed", err);
      setError(fr.company.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startPicking = async (residue: CompanyResidue) => {
    setPicking(residue);
    try {
      setCooperatives(await listCooperatives(residue.id));
    } catch (err) {
      console.error("load scored cooperatives failed", err);
    }
  };

  const allocate = async (cooperativeId: number) => {
    if (!picking) return;
    try {
      await allocateResidue(picking.id, cooperativeId);
      setPicking(null);
      await load();
    } catch (err) {
      console.error("allocate failed", err);
      setPicking(null);
      setError(fr.company.error);
    }
  };

  const release = async (residueId: number) => {
    try {
      await releaseResidue(residueId);
      await load();
    } catch (err) {
      console.error("release failed", err);
      setError(fr.company.error);
    }
  };

  const coopName = (id: number | null) => cooperatives.find((c) => c.id === id)?.cooperative_name;

  const TABS: { key: CompanyTab; label: string }[] = [
    { key: "residues", label: fr.felling.tabResidues },
    { key: "abattage", label: `${fr.felling.tabFelling} (${declarations.length})` },
    { key: "grumes", label: fr.custody.tab },
    { key: "documents", label: fr.docs.tab },
    { key: "titres", label: fr.titles.tab },
    { key: "taxes", label: fr.taxes.tab },
    { key: "tracabilite", label: fr.traceability.tab },
    { key: "fiscal", label: fr.fiscal.tab },
    { key: "cert", label: fr.cert.tab },
  ];

  return (
    <View style={styles.container}>
      {showHeader && <RoleHeader title={fr.company.title} subtitle={fr.company.subtitle} />}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabs}
        contentContainerStyle={styles.tabsContent}
      >
        {TABS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === "grumes" ? (
        <CustodyScreen />
      ) : tab === "documents" ? (
        <OrgDocuments />
      ) : tab === "titres" ? (
        <CompanyTitles />
      ) : tab === "taxes" ? (
        <OrgTaxes />
      ) : tab === "tracabilite" ? (
        <CompanyTraceability />
      ) : tab === "fiscal" ? (
        <CompanyFiscal />
      ) : tab === "cert" ? (
        <CompanyCertifications />
      ) : tab === "abattage" ? (
        declaring ? (
          <DeclareScreen
            onDone={() => {
              setDeclaring(false);
              void loadDeclarations();
            }}
            onBack={() => setDeclaring(false)}
          />
        ) : (
          <View style={styles.flex1}>
            <TouchableOpacity
              style={styles.declareBtn}
              onPress={() => setDeclaring(true)}
              testID="new-declaration"
            >
              <Text style={styles.declareText}>+ {fr.felling.newDeclaration}</Text>
            </TouchableOpacity>
            {declLoading ? (
              <ActivityIndicator style={styles.center} color={colors.accent} />
            ) : declError ? (
              <View style={styles.center}>
                <Text style={styles.error}>{declError}</Text>
                <TouchableOpacity onPress={loadDeclarations}>
                  <Text style={styles.link}>{fr.common.retry}</Text>
                </TouchableOpacity>
              </View>
            ) : declarations.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.dim}>{fr.felling.noDeclarations}</Text>
              </View>
            ) : (
              <FlatList
                data={declarations}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => (
                  <View style={styles.card}>
                    <Text style={styles.species}>
                      {fr.felling.declarationId(item.id)} · {item.permit_type} {item.permit_number}
                    </Text>
                    <Text style={styles.meta}>
                      {fr.felling.status[item.status]} · {item.line_count ?? 0} pieds
                      {item.aac_label ? ` · ${item.aac_label}` : ""}
                    </Text>
                    {item.decision_motif ? (
                      <Text style={styles.meta}>{item.decision_motif}</Text>
                    ) : null}
                    <TouchableOpacity
                      testID={`plates-${item.id}`}
                      onPress={() => void printPlates(item.id)}
                      disabled={platesBusy === item.id}
                    >
                      <Text style={styles.link}>
                        {platesBusy === item.id ? fr.felling.platesBusy : fr.felling.printPlates}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
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
      ) : residues.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.dim}>{fr.company.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={residues}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.species}>{item.species_scientific_name ?? "—"}</Text>
              <Text style={styles.meta}>
                {fr.company.biomass(item.residue_biomass_kg ?? 0)} · {fr.company.status[item.status]}
                {item.tree_code ? ` · 🌳 ${item.tree_code}` : ""}
              </Text>
              {item.assigned_community_cooperative_id ? (
                <Text style={styles.assigned}>
                  {fr.company.allocatedTo(
                    coopName(item.assigned_community_cooperative_id) ??
                      `#${item.assigned_community_cooperative_id}`,
                  )}
                </Text>
              ) : null}
              {item.status === "allocated" ? (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.action, styles.actionSecondary]}
                    onPress={() => startPicking(item)}
                  >
                    <Text style={styles.actionText}>{fr.company.reassign}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.action, styles.actionDanger]}
                    onPress={() => release(item.id)}
                  >
                    <Text style={styles.actionText}>{fr.company.release}</Text>
                  </TouchableOpacity>
                </View>
              ) : item.status === "available" ? (
                <TouchableOpacity style={styles.action} onPress={() => startPicking(item)}>
                  <Text style={styles.actionText}>{fr.company.allocate}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}

      <Modal
        visible={!!picking}
        transparent
        animationType="slide"
        onRequestClose={() => setPicking(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{fr.company.chooseCoop}</Text>
            <FlatList
              data={cooperatives}
              keyExtractor={(item) => String(item.id)}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.coopRow} onPress={() => allocate(item.id)}>
                  <Text style={styles.coopName}>{item.cooperative_name}</Text>
                  <Text style={styles.coopMeta}>
                    {item.profile_type}
                    {item.is_certified ? " · 🌿 certifiée" : ""}
                  </Text>
                  {item.match_score != null ? (
                    <Text style={styles.coopAffinity}>
                      {fr.company.relevant(item.relevant_mass_kg ?? 0)} ·{" "}
                      {fr.company.match(item.match_score)}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setPicking(null)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>{fr.company.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  tabs: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexGrow: 0,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tab: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
  },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.textDim, fontSize: type.body, fontWeight: "600" },
  tabTextActive: { color: colors.accent, fontWeight: "800" },
  declareBtn: {
    margin: spacing.md,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    padding: spacing.sm,
    alignItems: "center",
  },
  declareText: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
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
  species: { color: colors.text, fontSize: type.body, fontWeight: "700", fontStyle: "italic" },
  meta: { color: colors.textDim, fontSize: type.caption },
  assigned: { color: colors.success, fontSize: type.caption, fontWeight: "700" },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  actionSecondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionDanger: { backgroundColor: colors.error },
  actionText: { color: colors.primary, fontSize: type.caption, fontWeight: "800" },
  coopAffinity: { color: colors.success, fontSize: type.caption, fontWeight: "600", marginTop: spacing.xs },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(14,21,18,0.8)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "70%",
  },
  modalTitle: { color: colors.text, fontSize: type.heading, fontWeight: "700" },
  modalList: { flexGrow: 0 },
  coopRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  coopName: { color: colors.text, fontSize: type.body, fontWeight: "600" },
  coopMeta: { color: colors.textDim, fontSize: type.caption },
  cancelBtn: { alignItems: "center", paddingVertical: spacing.md },
  cancelText: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
});
