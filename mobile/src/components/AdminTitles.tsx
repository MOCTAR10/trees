import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  AacAction,
  actOnAac,
  AnnualCutBlock,
  createAac,
  createUnit,
  decideTitle,
  ForestTitle,
  listAacs,
  listOrganizations,
  listTitles,
  listUnits,
  ManagementUnit,
  Organization,
  TitleDecision,
  TitleStatus,
} from "../api/client";
import { ChevronDown, ChevronRight } from "lucide-react-native";

import { fr } from "../i18n/fr";
import { CardGrid, useDialog } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import AacAuthorizations from "./AacAuthorizations";
import TitleConventions from "./TitleConventions";
import TitleStudies from "./TitleStudies";
import UfaDme from "./UfaDme";
import Badge, { aacTone, titleTone } from "./Badge";

const DECISIONS: Record<TitleStatus, TitleDecision[]> = {
  demande: ["exploration", "rejete"],
  exploration: ["provisoire", "rejete", "retire"],
  provisoire: ["actif", "rejete", "retire"],
  actif: ["retire"],
  expire: [],
  retire: [],
  rejete: [],
};

function aacActions(status: AnnualCutBlock["status"]): AacAction[] {
  switch (status) {
    case "soumis":
      return ["autoriser", "rejeter"];
    case "autorise":
      return ["ouvrir"];
    case "ouvert":
      return ["fermer"];
    default:
      return [];
  }
}

const fmtSurface = (ha: number | null) =>
  ha == null ? null : `${ha.toLocaleString("fr-FR")} ${fr.titles.ha}`;

/** Ministry view: title decisions, UFA/AAC delineation and annual authorizations. */
export default function AdminTitles() {
  const th = useTheme();
  const styles = useStyles();
  const [titles, setTitles] = useState<ForestTitle[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [expandedTitle, setExpandedTitle] = useState<number | null>(null);
  const [units, setUnits] = useState<Record<number, ManagementUnit[]>>({});
  const [unitsLoading, setUnitsLoading] = useState<number | null>(null);
  const [expandedUnit, setExpandedUnit] = useState<number | null>(null);
  const [aacs, setAacs] = useState<Record<number, AnnualCutBlock[]>>({});
  const [aacsLoading, setAacsLoading] = useState<number | null>(null);

  const [addUnitFor, setAddUnitFor] = useState<number | null>(null);
  const [addAacFor, setAddAacFor] = useState<number | null>(null);
  const [motifFor, setMotifFor] = useState<{ title: ForestTitle; decision: TitleDecision } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [titleRows, organizations] = await Promise.all([listTitles(), listOrganizations()]);
      setTitles(titleRows);
      setOrgs(organizations);
    } catch (err) {
      console.error("admin titles load failed", err);
      setError(fr.titles.decideError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadUnits = async (titleId: number) => {
    setUnitsLoading(titleId);
    try {
      const rows = await listUnits(titleId);
      setUnits((prev) => ({ ...prev, [titleId]: rows }));
    } catch (err) {
      console.error("units load failed", err);
    } finally {
      setUnitsLoading(null);
    }
  };

  const loadAacs = async (ufaId: number) => {
    setAacsLoading(ufaId);
    try {
      const rows = await listAacs(ufaId);
      setAacs((prev) => ({ ...prev, [ufaId]: rows }));
    } catch (err) {
      console.error("aacs load failed", err);
    } finally {
      setAacsLoading(null);
    }
  };

  const toggleTitle = async (id: number) => {
    if (expandedTitle === id) {
      setExpandedTitle(null);
      return;
    }
    setExpandedTitle(id);
    if (!units[id]) await loadUnits(id);
  };

  const toggleUnit = async (id: number) => {
    if (expandedUnit === id) {
      setExpandedUnit(null);
      return;
    }
    setExpandedUnit(id);
    if (!aacs[id]) await loadAacs(id);
  };

  const orgName = useCallback((id: number | null | undefined) => {
    if (id == null) return "—";
    return orgs.find((o) => o.id === id)?.name ?? `#${id}`;
  }, [orgs]);

  const runDecision = async (title: ForestTitle, decision: TitleDecision, motif?: string | null) => {
    setBusyId(title.id);
    try {
      await decideTitle(title.id, decision, motif ?? null);
      setMessage(fr.titles.decided);
      await load();
    } catch (err) {
      console.error("title decision failed", err);
      setMessage(fr.titles.decideError);
    } finally {
      setBusyId(null);
    }
  };

  const onDecision = (title: ForestTitle, decision: TitleDecision) => {
    setMessage(null);
    if (decision === "rejete") {
      setMotifFor({ title, decision });
      return;
    }
    void runDecision(title, decision);
  };

  const runAacAction = async (aac: AnnualCutBlock, action: AacAction) => {
    setBusyId(aac.id);
    try {
      await actOnAac(aac.id, { action });
      setMessage(fr.titles.decided);
      await loadAacs(aac.ufa_id);
    } catch (err) {
      console.error("aac action failed", err);
      setMessage(fr.titles.decideError);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <ActivityIndicator style={styles.center} color={th.c.olive} />;
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity onPress={load}>
          <Text style={styles.link}>{fr.common.retry}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <ScrollView contentContainerStyle={styles.list}>
        {titles.length === 0 ? (
          <Text style={styles.dim}>{fr.titles.noTitles}</Text>
        ) : (
          <CardGrid>
            {titles.map((title) => (
              <View key={title.id} style={styles.card}>
                <TouchableOpacity
                  onPress={() => void toggleTitle(title.id)}
                  testID={`title-${title.id}`}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>
                      {`${title.title_type}${title.reference ? ` · ${title.reference}` : ""}`}
                    </Text>
                    <Badge
                      label={fr.titles.status[title.status] ?? title.status}
                      tone={titleTone(title.status)}
                    />
                  </View>
                  <Text style={styles.meta}>
                    {fr.titles.holder} : {orgName(title.holder_org_id)}
                    {fmtSurface(title.surface_ha) ? ` · ${fmtSurface(title.surface_ha)}` : ""}
                  </Text>
                  {title.decision_motif ? (
                    <Text style={styles.meta}>{title.decision_motif}</Text>
                  ) : null}
                </TouchableOpacity>
  
                {DECISIONS[title.status].length > 0 ? (
                  <View style={styles.decideRow}>
                    {DECISIONS[title.status].map((decision) => (
                      <TouchableOpacity
                        key={decision}
                        style={[
                          styles.decide,
                          decision === "rejete" ? styles.reject : decision === "retire" ? styles.withdraw : styles.approve,
                        ]}
                        disabled={busyId === title.id}
                        onPress={() => onDecision(title, decision)}
                        testID={`decide-${title.id}-${decision}`}
                      >
                        <Text style={[styles.decideText, decision === "retire" && styles.withdrawText]}>
                          {fr.titles.decide[decision]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <TouchableOpacity style={styles.toggle} onPress={() => void toggleTitle(title.id)}>
                  {expandedTitle === title.id ? (
                    <ChevronDown size={16} color={th.c.olive} />
                  ) : (
                    <ChevronRight size={16} color={th.c.olive} />
                  )}
                  <Text style={styles.toggleText}>
                    {expandedTitle === title.id ? fr.titles.closeDetail : fr.titles.openDetail}
                  </Text>
                </TouchableOpacity>
  
                {expandedTitle === title.id ? (
                  <View style={styles.detail}>
                    <TitleConventions titleId={title.id} mode="admin" />
                    <TitleStudies titleId={title.id} mode="admin" />
                    <View style={styles.sectionRow}>
                      <Text style={styles.section}>{fr.titles.units}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setMessage(null);
                          setAddUnitFor(title.id);
                        }}
                        testID={`add-unit-${title.id}`}
                      >
                        <Text style={styles.link}>+ {fr.titles.addUnit}</Text>
                      </TouchableOpacity>
                    </View>
                    {unitsLoading === title.id ? (
                      <ActivityIndicator color={th.c.olive} />
                    ) : (units[title.id] ?? []).length === 0 ? (
                      <Text style={styles.dim}>{fr.titles.noUnits}</Text>
                    ) : (
                      (units[title.id] ?? []).map((unit) => (
                        <View key={unit.id} style={styles.subCard}>
                          <TouchableOpacity
                            onPress={() => void toggleUnit(unit.id)}
                            testID={`unit-${unit.id}`}
                          >
                            <View style={styles.cardTop}>
                              <Text style={[styles.subTitle, styles.flex1]}>{unit.label}</Text>
                              {expandedUnit === unit.id ? (
                                <ChevronDown size={16} color={th.c.olive} />
                              ) : (
                                <ChevronRight size={16} color={th.c.olive} />
                              )}
                            </View>
                            <Text style={styles.meta}>
                              {[fmtSurface(unit.surface_ha), expandedUnit === unit.id ? null : fr.titles.openAacs]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>
                          </TouchableOpacity>
  
                          {expandedUnit === unit.id ? (
                            <View style={styles.detail}>
                              <View style={styles.sectionRow}>
                                <Text style={styles.section}>{fr.titles.aacs}</Text>
                                <TouchableOpacity
                                  onPress={() => {
                                    setMessage(null);
                                    setAddAacFor(unit.id);
                                  }}
                                  testID={`add-aac-${unit.id}`}
                                >
                                  <Text style={styles.link}>+ {fr.titles.addAac}</Text>
                                </TouchableOpacity>
                              </View>
                              {aacsLoading === unit.id ? (
                                <ActivityIndicator color={th.c.olive} />
                              ) : (aacs[unit.id] ?? []).length === 0 ? (
                                <Text style={styles.dim}>{fr.titles.noAacs}</Text>
                              ) : (
                                (aacs[unit.id] ?? []).map((aac) => (
                                  <View key={aac.id} style={styles.aacCard}>
                                    <View style={styles.cardTop}>
                                      <Text style={styles.aacTitle}>{aac.label}</Text>
                                      <Badge
                                        label={fr.titles.aacStatus[aac.status] ?? aac.status}
                                        tone={aacTone(aac.status)}
                                      />
                                    </View>
                                    <Text style={styles.meta}>
                                      {fr.titles.campaign} {aac.campaign_year ?? "—"}
                                      {aac.possibility_m3 != null
                                        ? ` · ${fr.titles.possibility} ${aac.possibility_m3} ${fr.titles.m3}`
                                        : ""}
                                    </Text>
                                    {aacActions(aac.status).length > 0 ? (
                                      <View style={styles.decideRow}>
                                        {aacActions(aac.status).map((action) => (
                                          <TouchableOpacity
                                            key={action}
                                            style={[
                                              styles.decide,
                                              action === "rejeter" ? styles.reject : styles.approve,
                                            ]}
                                            disabled={busyId === aac.id}
                                            onPress={() => void runAacAction(aac, action)}
                                            testID={`aac-${aac.id}-${action}`}
                                          >
                                            <Text style={styles.decideText}>
                                              {fr.titles.adminAac[action]}
                                            </Text>
                                          </TouchableOpacity>
                                        ))}
                                      </View>
                                    ) : null}
                                    <AacAuthorizations aacId={aac.id} mode="admin" />
                                  </View>
                                ))
                              )}
                              <UfaDme ufaId={unit.id} mode="admin" />
                            </View>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            ))}
          </CardGrid>
        )}
      </ScrollView>

      <AddUnitModal
        titleId={addUnitFor}
        onClose={() => setAddUnitFor(null)}
        onSaved={(titleId) => {
          setAddUnitFor(null);
          setMessage(fr.titles.decided);
          void loadUnits(titleId);
        }}
      />

      <AddAacModal
        ufaId={addAacFor}
        onClose={() => setAddAacFor(null)}
        onSaved={(ufaId) => {
          setAddAacFor(null);
          setMessage(fr.titles.decided);
          void loadAacs(ufaId);
        }}
      />

      <MotifModal
        target={motifFor}
        onClose={() => setMotifFor(null)}
        onConfirm={(title, decision, motif) => {
          setMotifFor(null);
          void runDecision(title, decision, motif);
        }}
      />
    </View>
  );
}

function AddUnitModal({
  titleId,
  onClose,
  onSaved,
}: {
  titleId: number | null;
  onClose: () => void;
  onSaved: (titleId: number) => void;
}) {
  const dialog = useDialog();
  const th = useTheme();
  const styles = useStyles();
  const [label, setLabel] = useState("");
  const [surface, setSurface] = useState("");
  const [planRef, setPlanRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLabel("");
    setSurface("");
    setPlanRef("");
    setError(null);
  }, [titleId]);

  const submit = async () => {
    if (titleId == null || busy) return;
    if (!label.trim()) {
      setError(fr.titles.unitLabel);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ha = parseFloat(surface.replace(",", "."));
      await createUnit(titleId, {
        label: label.trim(),
        surface_ha: Number.isFinite(ha) ? ha : null,
        plan_amenagement_ref: planRef.trim() || null,
      });
      onSaved(titleId);
    } catch (err) {
      console.error("create unit failed", err);
      setError(fr.titles.createError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={titleId != null} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
          <Text style={styles.modalTitle}>{fr.titles.addUnit}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.titles.unitLabel}
              placeholderTextColor={th.c.muted}
              value={label}
              onChangeText={setLabel}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.surface}
              placeholderTextColor={th.c.muted}
              value={surface}
              onChangeText={setSurface}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.reference}
              placeholderTextColor={th.c.muted}
              value={planRef}
              onChangeText={setPlanRef}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.submitDisabled]}
                onPress={submit}
                disabled={busy}
                testID="unit-submit"
              >
                {busy ? (
                  <ActivityIndicator color={th.c.onOlive} />
                ) : (
                  <Text style={styles.submitText}>{fr.titles.addUnit}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AddAacModal({
  ufaId,
  onClose,
  onSaved,
}: {
  ufaId: number | null;
  onClose: () => void;
  onSaved: (ufaId: number) => void;
}) {
  const dialog = useDialog();
  const th = useTheme();
  const styles = useStyles();
  const [label, setLabel] = useState("");
  const [campaign, setCampaign] = useState(String(new Date().getFullYear()));
  const [surface, setSurface] = useState("");
  const [possibility, setPossibility] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLabel("");
    setCampaign(String(new Date().getFullYear()));
    setSurface("");
    setPossibility("");
    setError(null);
  }, [ufaId]);

  const submit = async () => {
    if (ufaId == null || busy) return;
    if (!label.trim()) {
      setError(fr.titles.aacLabel);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ha = parseFloat(surface.replace(",", "."));
      const m3 = parseFloat(possibility.replace(",", "."));
      await createAac(ufaId, {
        label: label.trim(),
        campaign_year: parseInt(campaign, 10) || null,
        surface_ha: Number.isFinite(ha) ? ha : null,
        possibility_m3: Number.isFinite(m3) ? m3 : null,
        origin: "plan_amenagement",
      });
      onSaved(ufaId);
    } catch (err) {
      console.error("create aac failed", err);
      setError(fr.titles.createError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={ufaId != null} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
          <Text style={styles.modalTitle}>{fr.titles.addAac}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.titles.aacLabel}
              placeholderTextColor={th.c.muted}
              value={label}
              onChangeText={setLabel}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.campaign}
              placeholderTextColor={th.c.muted}
              value={campaign}
              onChangeText={setCampaign}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.surface}
              placeholderTextColor={th.c.muted}
              value={surface}
              onChangeText={setSurface}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={`${fr.titles.possibility} (${fr.titles.m3})`}
              placeholderTextColor={th.c.muted}
              value={possibility}
              onChangeText={setPossibility}
              keyboardType="numeric"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.submitDisabled]}
                onPress={submit}
                disabled={busy}
                testID="aac-submit"
              >
                {busy ? (
                  <ActivityIndicator color={th.c.onOlive} />
                ) : (
                  <Text style={styles.submitText}>{fr.titles.addAac}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MotifModal({
  target,
  onClose,
  onConfirm,
}: {
  target: { title: ForestTitle; decision: TitleDecision } | null;
  onClose: () => void;
  onConfirm: (title: ForestTitle, decision: TitleDecision, motif: string) => void;
}) {
  const dialog = useDialog();
  const th = useTheme();
  const styles = useStyles();
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMotif("");
    setError(null);
  }, [target]);

  const confirm = () => {
    if (!target) return;
    if (!motif.trim()) {
      setError(fr.titles.motifRequired);
      return;
    }
    onConfirm(target.title, target.decision, motif.trim());
  };

  return (
    <Modal visible={!!target} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
          <Text style={styles.modalTitle}>{fr.titles.motif}</Text>
          <TextInput
            style={styles.input}
            placeholder={fr.titles.motif}
            placeholderTextColor={th.c.muted}
            value={motif}
            onChangeText={setMotif}
            multiline
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, styles.reject]}
              onPress={confirm}
              testID="motif-submit"
            >
              <Text style={styles.submitText}>{fr.titles.decide.rejete}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((th) => ({
  container: { flex: 1, backgroundColor: th.c.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: th.space.lg,
    padding: th.space.xl,
  },
  error: { color: th.c.risk, fontSize: 15, fontFamily: th.fonts.body, textAlign: "center" },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  message: {
    color: th.c.ok,
    fontSize: 12,
    fontFamily: th.fonts.bodyBold,
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.sm,
  },
  list: { padding: th.space.lg, gap: th.space.sm, paddingBottom: th.space.xxl },
  card: {
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: th.space.sm,
  },
  cardTitle: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold, flex: 1 },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body, marginTop: th.space.xs },
  detail: { gap: th.space.sm, marginTop: th.space.sm },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  section: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  subCard: {
    backgroundColor: th.c.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.sm,
    gap: th.space.xs,
  },
  subTitle: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  aacCard: {
    backgroundColor: th.c.surface2,
    borderRadius: 8,
    padding: th.space.sm,
    gap: th.space.xs,
  },
  aacTitle: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold, flex: 1 },
  decideRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: th.space.sm,
    marginTop: th.space.sm,
  },
  decide: { borderRadius: 8, paddingVertical: th.space.sm, paddingHorizontal: th.space.lg },
  approve: { backgroundColor: th.c.ok },
  reject: { backgroundColor: th.c.risk },
  decideText: { color: "#FFFFFF", fontSize: 12, fontFamily: th.fonts.bodyBold },
  withdraw: { backgroundColor: "transparent", borderWidth: 1, borderColor: th.c.risk },
  withdrawText: { color: th.c.risk },
  flex1: { flex: 1 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: th.space.xs, alignSelf: "flex-start" },
  toggleText: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
  backdrop: { flex: 1, backgroundColor: "rgba(14,21,18,0.8)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: th.c.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: th.space.xl,
    maxHeight: "85%",
  },
  modalTitle: {
    color: th.c.ink,
    fontSize: 19,
    fontFamily: th.fonts.bodyBold,
    marginBottom: th.space.sm,
  },
  form: { paddingBottom: th.space.sm },
  input: {
    backgroundColor: th.c.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
    color: th.c.ink,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    fontSize: 15,
    fontFamily: th.fonts.body,
    marginBottom: th.space.sm,
  },
  actions: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.sm },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: th.space.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  cancelText: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  submitBtn: {
    flex: 2,
    alignItems: "center",
    paddingVertical: th.space.lg,
    borderRadius: 10,
    backgroundColor: th.c.olive,
  },
  submitText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  submitDisabled: { opacity: 0.6 },
}));
