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
  actOnAac,
  AnnualCutBlock,
  ForestTitle,
  listAacs,
  listTitles,
  listUnits,
  ManagementUnit,
  requestTitle,
  TitleType,
  TitleZone,
} from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";
import AacAuthorizations from "./AacAuthorizations";
import TitleConventions from "./TitleConventions";
import UfaDme from "./UfaDme";
import Badge, { aacTone, titleTone } from "./Badge";

const TITLE_TYPES: TitleType[] = ["CFAD", "PFA", "PGG", "FC"];
const ZONES: TitleZone[] = ["permanent", "rural"];

const fmtSurface = (ha: number | null) =>
  ha == null ? null : `${ha.toLocaleString("fr-FR")} ${fr.titles.ha}`;

/** Company view: own titles, drill-down to UFA and AAC, submit an annual PAO. */
export default function CompanyTitles() {
  const [titles, setTitles] = useState<ForestTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [expandedTitle, setExpandedTitle] = useState<number | null>(null);
  const [units, setUnits] = useState<Record<number, ManagementUnit[]>>({});
  const [unitsLoading, setUnitsLoading] = useState<number | null>(null);
  const [expandedUnit, setExpandedUnit] = useState<number | null>(null);
  const [aacs, setAacs] = useState<Record<number, AnnualCutBlock[]>>({});
  const [aacsLoading, setAacsLoading] = useState<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [paoFor, setPaoFor] = useState<AnnualCutBlock | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTitles(await listTitles());
    } catch (err) {
      console.error("titles load failed", err);
      setError(fr.titles.requestError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    if (!units[id]) {
      setUnitsLoading(id);
      try {
        const rows = await listUnits(id);
        setUnits((prev) => ({ ...prev, [id]: rows }));
      } catch (err) {
        console.error("units load failed", err);
      } finally {
        setUnitsLoading(null);
      }
    }
  };

  const toggleUnit = async (id: number) => {
    if (expandedUnit === id) {
      setExpandedUnit(null);
      return;
    }
    setExpandedUnit(id);
    if (!aacs[id]) await loadAacs(id);
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
    <ScrollView contentContainerStyle={styles.list}>
      <TouchableOpacity
        style={styles.newBtn}
        onPress={() => {
          setMessage(null);
          setCreating(true);
        }}
        testID="new-title"
      >
        <Text style={styles.newBtnText}>+ {fr.titles.newTitle}</Text>
      </TouchableOpacity>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {titles.length === 0 ? (
        <Text style={styles.dim}>{fr.titles.noTitles}</Text>
      ) : (
        titles.map((title) => (
          <View key={title.id} style={styles.card}>
            <TouchableOpacity onPress={() => void toggleTitle(title.id)} testID={`title-${title.id}`}>
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
                {title.zone ? fr.titles.zoneLabel[title.zone] : ""}
                {fmtSurface(title.surface_ha) ? ` · ${fmtSurface(title.surface_ha)}` : ""}
              </Text>
            </TouchableOpacity>

            {expandedTitle === title.id ? (
              <View style={styles.detail}>
                <TitleConventions titleId={title.id} mode="company" />
                <Text style={styles.section}>{fr.titles.units}</Text>
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
                          <Text style={styles.section}>{fr.titles.aacs}</Text>
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
                                <Text style={styles.meta}>
                                  {fr.titles.origin[aac.origin] ?? aac.origin}
                                </Text>
                                {aac.pao_reference ? (
                                  <Text style={styles.meta}>
                                    PAO : {aac.pao_reference}
                                  </Text>
                                ) : null}
                                {aac.status === "prepare" ? (
                                  <TouchableOpacity
                                    style={styles.action}
                                    onPress={() => {
                                      setMessage(null);
                                      setPaoFor(aac);
                                    }}
                                    testID={`pao-${aac.id}`}
                                  >
                                    <Text style={styles.actionText}>{fr.titles.submitPao}</Text>
                                  </TouchableOpacity>
                                ) : null}
                                <AacAuthorizations aacId={aac.id} mode="company" />
                              </View>
                            ))
                          )}
                          <UfaDme ufaId={unit.id} mode="company" />
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

      <NewTitleModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          setMessage(fr.titles.requested);
          void load();
        }}
      />

      <PaoModal
        aac={paoFor}
        onClose={() => setPaoFor(null)}
        onSaved={(ufaId) => {
          setPaoFor(null);
          setMessage(fr.titles.paoSubmitted);
          void loadAacs(ufaId);
        }}
      />
    </ScrollView>
  );
}

function NewTitleModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [titleType, setTitleType] = useState<TitleType>("CFAD");
  const [reference, setReference] = useState("");
  const [zone, setZone] = useState<TitleZone>("permanent");
  const [surface, setSurface] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitleType("CFAD");
    setReference("");
    setZone("permanent");
    setSurface("");
    setError(null);
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    if (!reference.trim()) {
      setError(fr.titles.referenceRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ha = parseFloat(surface.replace(",", "."));
      await requestTitle({
        title_type: titleType,
        reference: reference.trim(),
        zone,
        surface_ha: Number.isFinite(ha) ? ha : null,
      });
      onCreated();
    } catch (err) {
      console.error("title request failed", err);
      setError(fr.titles.requestError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.titles.newTitle}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{fr.titles.titleType}</Text>
            <View style={styles.chips}>
              {TITLE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, titleType === t && styles.chipOn]}
                  onPress={() => setTitleType(t)}
                >
                  <Text style={[styles.chipText, titleType === t && styles.chipTextOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder={fr.titles.reference}
              placeholderTextColor={colors.textDim}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
            />

            <Text style={styles.fieldLabel}>{fr.titles.zone}</Text>
            <View style={styles.chips}>
              {ZONES.map((z) => (
                <TouchableOpacity
                  key={z}
                  style={[styles.chip, zone === z && styles.chipOn]}
                  onPress={() => setZone(z)}
                >
                  <Text style={[styles.chipText, zone === z && styles.chipTextOn]}>
                    {fr.titles.zoneLabel[z]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder={fr.titles.surface}
              placeholderTextColor={colors.textDim}
              value={surface}
              onChangeText={setSurface}
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
                testID="title-submit"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitText}>{fr.titles.newTitle}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PaoModal({
  aac,
  onClose,
  onSaved,
}: {
  aac: AnnualCutBlock | null;
  onClose: () => void;
  onSaved: (ufaId: number) => void;
}) {
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReference("");
    setError(null);
  }, [aac]);

  const submit = async () => {
    if (!aac || busy) return;
    if (!reference.trim()) {
      setError(fr.titles.paoRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await actOnAac(aac.id, { action: "soumettre_pao", pao_reference: reference.trim() });
      onSaved(aac.ufa_id);
    } catch (err) {
      console.error("pao submit failed", err);
      setError(fr.titles.paoError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!aac} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>
            {fr.titles.submitPao}
            {aac ? ` · ${aac.label}` : ""}
          </Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.titles.paoRef}
              placeholderTextColor={colors.textDim}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
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
                testID="pao-submit"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitText}>{fr.titles.submitPao}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  error: { color: colors.error, fontSize: type.body, textAlign: "center" },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  newBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  newBtnText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
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
  success: { color: colors.success, fontSize: type.body, fontWeight: "700" },
  detail: { gap: spacing.sm, marginTop: spacing.sm },
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
  action: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  actionText: { color: colors.accent, fontSize: type.caption, fontWeight: "800" },
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
  fieldLabel: { color: colors.textDim, fontSize: type.caption, marginBottom: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: type.caption, fontWeight: "700" },
  chipTextOn: { color: colors.primary },
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
