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
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";
import AacAuthorizations from "./AacAuthorizations";
import OrgBackfill from "./OrgBackfill";
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
    return <ActivityIndicator style={styles.center} color={colors.accent} />;
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
        <OrgBackfill onBackfilled={load} />
        {titles.length === 0 ? (
          <Text style={styles.dim}>{fr.titles.noTitles}</Text>
        ) : (
          titles.map((title) => (
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
                      style={[styles.decide, decision === "rejete" ? styles.reject : styles.approve]}
                      disabled={busyId === title.id}
                      onPress={() => onDecision(title, decision)}
                      testID={`decide-${title.id}-${decision}`}
                    >
                      <Text style={styles.decideText}>{fr.titles.decide[decision]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

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
                    <ActivityIndicator color={colors.accent} />
                  ) : (units[title.id] ?? []).length === 0 ? (
                    <Text style={styles.dim}>{fr.titles.noUnits}</Text>
                  ) : (
                    (units[title.id] ?? []).map((unit) => (
                      <View key={unit.id} style={styles.subCard}>
                        <TouchableOpacity
                          onPress={() => void toggleUnit(unit.id)}
                          testID={`unit-${unit.id}`}
                        >
                          <Text style={styles.subTitle}>{unit.label}</Text>
                          {fmtSurface(unit.surface_ha) ? (
                            <Text style={styles.meta}>{fmtSurface(unit.surface_ha)}</Text>
                          ) : null}
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
                              <ActivityIndicator color={colors.accent} />
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
          ))
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
    <Modal visible={titleId != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.titles.addUnit}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.titles.unitLabel}
              placeholderTextColor={colors.textDim}
              value={label}
              onChangeText={setLabel}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.surface}
              placeholderTextColor={colors.textDim}
              value={surface}
              onChangeText={setSurface}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.reference}
              placeholderTextColor={colors.textDim}
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
                  <ActivityIndicator color={colors.primary} />
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
    <Modal visible={ufaId != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.titles.addAac}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.titles.aacLabel}
              placeholderTextColor={colors.textDim}
              value={label}
              onChangeText={setLabel}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.campaign}
              placeholderTextColor={colors.textDim}
              value={campaign}
              onChangeText={setCampaign}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.surface}
              placeholderTextColor={colors.textDim}
              value={surface}
              onChangeText={setSurface}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={`${fr.titles.possibility} (${fr.titles.m3})`}
              placeholderTextColor={colors.textDim}
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
                  <ActivityIndicator color={colors.primary} />
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
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.titles.motif}</Text>
          <TextInput
            style={styles.input}
            placeholder={fr.titles.motif}
            placeholderTextColor={colors.textDim}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  error: { color: colors.error, fontSize: type.body, textAlign: "center" },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  message: {
    color: colors.success,
    fontSize: type.caption,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: { color: colors.text, fontSize: type.body, fontWeight: "800", flex: 1 },
  meta: { color: colors.textDim, fontSize: type.caption },
  dim: { color: colors.textDim, fontSize: type.body, marginTop: spacing.xs },
  detail: { gap: spacing.sm, marginTop: spacing.sm },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  section: { color: colors.accent, fontSize: type.body, fontWeight: "800" },
  subCard: {
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  subTitle: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  aacCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  aacTitle: { color: colors.text, fontSize: type.body, fontWeight: "700", flex: 1 },
  decideRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  decide: { borderRadius: 8, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  approve: { backgroundColor: colors.success },
  reject: { backgroundColor: colors.error },
  decideText: { color: "#FFFFFF", fontSize: type.caption, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(14,21,18,0.8)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  modalTitle: {
    color: colors.text,
    fontSize: type.heading,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  form: { paddingBottom: spacing.sm },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: type.body,
    marginBottom: spacing.sm,
  },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  submitBtn: {
    flex: 2,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  submitText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  submitDisabled: { opacity: 0.6 },
});
