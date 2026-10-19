import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import CompanyTitles from "../components/CompanyTitles";
import CompanyTraceability from "../components/CompanyTraceability";
import CompanyFiscal from "../components/CompanyFiscal";
import CompanyCertifications from "../components/CompanyCertifications";
import OrgDocuments from "../components/OrgDocuments";
import OrgTaxes from "../components/OrgTaxes";
import CompanyAgents from "../components/CompanyAgents";
import CompanyNav, { CompanyTab } from "../components/CompanyNav";
import MillRegister from "../components/MillRegister";
import CompanyHomeScreen from "./CompanyHomeScreen";
import CustodyScreen from "./CustodyScreen";
import DeclareScreen from "./DeclareScreen";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, Pill, PillTone, Txt } from "../design/ui";

const DECLARATION_TONE: Record<string, PillTone> = { soumise: "info", autorisee: "ok", rejetee: "risk" };

interface Props {
  user: AuthUser;
  onLogout: () => void;
  showHeader?: boolean;
  /** Controlled area / screen (desktop web: the side menu drives it). */
  tab?: CompanyTab;
  onTabChange?: (tab: CompanyTab) => void;
  desktop?: boolean;
}


export default function CompanyScreen({ user, onLogout, showHeader = true, tab: controlledTab, onTabChange, desktop }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const [residues, setResidues] = useState<CompanyResidue[]>([]);
  const [cooperatives, setCooperatives] = useState<Cooperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<CompanyResidue | null>(null);
  const [ownTab, setOwnTab] = useState<CompanyTab>("accueil");
  const tab = controlledTab ?? ownTab;
  const setTab = onTabChange ?? setOwnTab;
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

  const LABELS: Record<CompanyTab, string> = {
    accueil: fr.companySpace.groups.accueil,
    equipe: fr.companySpace.tabTeam,
    usine: fr.companySpace.tabMill,
    abattage: `${fr.felling.tabFelling} (${declarations.length})`,
    grumes: fr.custody.tab,
    tracabilite: fr.traceability.tab,
    documents: fr.docs.tab,
    titres: fr.titles.tab,
    cert: fr.cert.tab,
    taxes: fr.taxes.tab,
    fiscal: fr.fiscal.tab,
    residues: fr.felling.tabResidues,
  };

  return (
    <View style={styles.container}>
      {showHeader && <RoleHeader title={fr.company.title} subtitle={fr.company.subtitle} />}

      <CompanyNav tab={tab} labels={LABELS} onChange={setTab} hideGroups={desktop} />

      {tab === "accueil" ? (
        <CompanyHomeScreen onOpen={(target) => setTab(target as CompanyTab)} />
      ) : tab === "equipe" ? (
        <CompanyAgents />
      ) : tab === "usine" ? (
        <MillRegister mode="company" />
      ) : tab === "grumes" ? (
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
            <View style={styles.declareBar}>
              <Button label={`+ ${fr.felling.newDeclaration}`} onPress={() => setDeclaring(true)} testID="new-declaration" />
            </View>
            {declLoading ? (
              <ActivityIndicator style={styles.center} color={theme.c.olive} />
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
                  <Card testID={`declaration-${item.id}`}>
                    <View style={styles.cardHead}>
                      <Txt variant="heading" style={styles.flex1}>
                        {fr.felling.declarationId(item.id)}
                      </Txt>
                      <Pill label={fr.felling.status[item.status]} tone={DECLARATION_TONE[item.status] ?? "neutral"} />
                    </View>
                    <Txt variant="small" bold>
                      {`${fr.felling.titleTypeLabel[item.permit_type === "foret_communautaire" ? "FC" : item.permit_type] ?? item.permit_type} · ${item.permit_number}`}
                    </Txt>
                    <Txt variant="small" tone="muted">
                      {[fr.felling.treesCount(item.line_count ?? 0), item.aac_label, item.ufa_label].filter(Boolean).join(" · ")}
                    </Txt>
                    {item.decision_motif ? (
                      <Txt variant="small" tone={item.status === "rejetee" ? "risk" : "muted"}>
                        {item.decision_motif}
                      </Txt>
                    ) : null}
                    <Button
                      compact
                      variant="secondary"
                      label={platesBusy === item.id ? fr.felling.platesBusy : fr.felling.printPlates}
                      loading={platesBusy === item.id}
                      disabled={platesBusy === item.id}
                      onPress={() => void printPlates(item.id)}
                      testID={`plates-${item.id}`}
                      style={styles.platesBtn}
                    />
                  </Card>
                )}
              />
            )}
          </View>
        )
      ) : loading ? (
        <ActivityIndicator style={styles.center} color={theme.c.olive} />
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

const useStyles = makeStyles((th) => ({
  container: { flex: 1, backgroundColor: th.c.bg },
  flex1: { flex: 1 },
  declareBar: { paddingHorizontal: th.space.lg, paddingTop: th.space.lg, alignItems: "flex-start" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  platesBtn: { alignSelf: "flex-start", marginTop: th.space.xs },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.lg },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body },
  error: { color: th.c.risk, fontSize: 15, fontFamily: th.fonts.body },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  list: { padding: th.space.lg, gap: th.space.sm },
  card: {
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  species: { color: th.c.ink, fontSize: 15, fontStyle: "italic", fontFamily: th.fonts.bodyBold },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  assigned: { color: th.c.ok, fontSize: 12, fontFamily: th.fonts.bodyBold },
  actionsRow: {
    flexDirection: "row",
    gap: th.space.sm,
    marginTop: th.space.sm,
  },
  action: {
    flex: 1,
    backgroundColor: th.c.olive,
    borderRadius: 8,
    paddingVertical: th.space.sm,
    alignItems: "center",
  },
  actionSecondary: {
    backgroundColor: th.c.surface2,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  actionDanger: { backgroundColor: th.c.risk },
  actionText: { color: th.c.onOlive, fontSize: 12, fontFamily: th.fonts.bodyBold },
  coopAffinity: { color: th.c.ok, fontSize: 12, marginTop: th.space.xs, fontFamily: th.fonts.bodyBold },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(14,21,18,0.8)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: th.c.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: th.space.xl,
    gap: th.space.sm,
    maxHeight: "70%",
  },
  modalTitle: { color: th.c.ink, fontSize: 20, fontFamily: th.fonts.display },
  modalList: { flexGrow: 0 },
  coopRow: {
    paddingVertical: th.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  coopName: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  coopMeta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  cancelBtn: { alignItems: "center", paddingVertical: th.space.lg },
  cancelText: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
}));
