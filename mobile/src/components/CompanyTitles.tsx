import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
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
import { ChevronDown, ChevronRight } from "lucide-react-native";

import { fr } from "../i18n/fr";
import AacAuthorizations from "./AacAuthorizations";
import TitleConventions from "./TitleConventions";
import TitleStudies from "./TitleStudies";
import UfaDme from "./UfaDme";
import Badge, { aacTone, titleTone } from "./Badge";
import { CardGrid, useDialog } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button } from "../design/ui";
import InventoryImportScreen from "../screens/InventoryImportScreen";

const TITLE_TYPES: TitleType[] = ["CFAD", "PFA", "PGG", "FC"];
const TYPE_ZONE: Record<TitleType, TitleZone> = { CFAD: "permanent", PFA: "permanent", PGG: "rural", FC: "rural" };

const fmtSurface = (ha: number | null) =>
  ha == null ? null : `${ha.toLocaleString("fr-FR")} ${fr.titles.ha}`;

/** Company view: own titles, drill-down to UFA and AAC, submit an annual PAO. */
export default function CompanyTitles() {
  const styles = useStyles();
  const theme = useTheme();
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
  const [inventoryFor, setInventoryFor] = useState<number | null>(null);

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
    return <ActivityIndicator style={styles.center} color={theme.c.olive} />;
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
        style={[styles.newBtn, styles.newBtnSize]}
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
        <CardGrid>
          {titles.map((title) => (
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
                  {[fr.titles.typeLabel[title.title_type], title.zone ? fr.titles.zoneLabel[title.zone] : null, fmtSurface(title.surface_ha)]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                <View style={styles.toggle}>
                  {expandedTitle === title.id ? (
                    <ChevronDown size={16} color={theme.c.olive} />
                  ) : (
                    <ChevronRight size={16} color={theme.c.olive} />
                  )}
                  <Text style={styles.toggleText}>
                    {expandedTitle === title.id ? fr.titles.closeDetail : fr.titles.openDetail}
                  </Text>
                </View>
              </TouchableOpacity>
  
              {expandedTitle === title.id ? (
                <View style={styles.detail}>
                  <TitleConventions titleId={title.id} mode="company" />
                  <TitleStudies titleId={title.id} mode="company" />
                  <Text style={styles.section}>{fr.titles.units}</Text>
                  {unitsLoading === title.id ? (
                    <ActivityIndicator color={theme.c.olive} />
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
                              <ChevronDown size={16} color={theme.c.olive} />
                            ) : (
                              <ChevronRight size={16} color={theme.c.olive} />
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
                            <Text style={styles.section}>{fr.titles.aacs}</Text>
                            {aacsLoading === unit.id ? (
                              <ActivityIndicator color={theme.c.olive} />
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
                                  {aac.status !== "ferme" ? (
                                    <Button
                                      compact
                                      variant="secondary"
                                      label={fr.inventory.open}
                                      onPress={() => setInventoryFor(aac.id)}
                                      testID={`inventory-${aac.id}`}
                                      style={styles.inventoryBtn}
                                    />
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
          ))}
        </CardGrid>
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

      <Modal visible={inventoryFor != null} animationType="slide" onRequestClose={() => setInventoryFor(null)}>
        {inventoryFor != null ? (
          <InventoryImportScreen initialAacId={inventoryFor} onBack={() => setInventoryFor(null)} />
        ) : null}
      </Modal>

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
  const dialog = useDialog();
  const styles = useStyles();
  const theme = useTheme();
  const [titleType, setTitleType] = useState<TitleType>("CFAD");
  const [reference, setReference] = useState("");
  const [surface, setSurface] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitleType("CFAD");
    setReference("");
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
        zone: TYPE_ZONE[titleType],
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
    <Modal visible={visible} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
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
            <Text style={styles.typeName} testID="title-type-name">
              {fr.titles.typeLabel[titleType]}
            </Text>
            <Text style={styles.hint} testID="title-zone">
              {fr.titles.zoneFromType(fr.titles.zoneLabel[TYPE_ZONE[titleType]])}
            </Text>

            <TextInput
              style={styles.input}
              placeholder={fr.titles.reference}
              placeholderTextColor={theme.c.muted}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
            />

            <TextInput
              style={styles.input}
              placeholder={fr.titles.surface}
              placeholderTextColor={theme.c.muted}
              value={surface}
              onChangeText={setSurface}
              keyboardType="numeric"
            />
            <Text style={styles.hint} testID="title-surface-hint">
              {fr.titles.surfaceHint[titleType]}
            </Text>

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
                  <ActivityIndicator color={theme.c.forest} />
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
  const dialog = useDialog();
  const styles = useStyles();
  const theme = useTheme();
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
    <Modal visible={!!aac} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
          <Text style={styles.modalTitle}>
            {fr.titles.submitPao}
            {aac ? ` · ${aac.label}` : ""}
          </Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.titles.paoRef}
              placeholderTextColor={theme.c.muted}
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
                  <ActivityIndicator color={theme.c.forest} />
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

const useStyles = makeStyles((th) => ({
  inventoryBtn: { alignSelf: "flex-start", marginTop: th.space.xs },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: th.space.lg,
    padding: th.space.xl,
  },
  error: { color: th.c.risk, fontSize: 15, textAlign: "center", fontFamily: th.fonts.body },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  list: { padding: th.space.lg, gap: th.space.sm, paddingBottom: th.space.xxl },
  newBtn: {
    backgroundColor: th.c.olive,
    borderRadius: 10,
    paddingVertical: th.space.sm,
    alignItems: "center",
  },
  newBtnText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  newBtnSize: { alignSelf: "flex-start", paddingHorizontal: th.space.xl, minHeight: 44, justifyContent: "center" },
  flex1: { flex: 1 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: th.space.xs },
  toggleText: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
  typeName: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold, marginBottom: 2 },
  hint: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, marginBottom: th.space.sm },
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
  cardTitle: { color: th.c.ink, fontSize: 15, flex: 1, fontFamily: th.fonts.bodyBold },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  dim: { color: th.c.muted, fontSize: 15, marginTop: th.space.xs, fontFamily: th.fonts.body },
  success: { color: th.c.ok, fontSize: 15, fontFamily: th.fonts.bodyBold },
  detail: { gap: th.space.sm, marginTop: th.space.sm },
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
  aacTitle: { color: th.c.ink, fontSize: 15, flex: 1, fontFamily: th.fonts.bodyBold },
  action: {
    marginTop: th.space.xs,
    borderWidth: 1,
    borderColor: th.c.olive,
    borderRadius: 8,
    paddingVertical: th.space.sm,
    alignItems: "center",
  },
  actionText: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
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
    fontSize: 20,
    marginBottom: th.space.sm,
    fontFamily: th.fonts.display,

  },
  form: { paddingBottom: th.space.sm },
  fieldLabel: { color: th.c.muted, fontSize: 12, marginBottom: th.space.xs, fontFamily: th.fonts.body },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs, marginBottom: th.space.sm },
  chip: {
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.bg,
  },
  chipOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  chipText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  chipTextOn: { color: th.c.onOlive },
  input: {
    backgroundColor: th.c.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
    color: th.c.ink,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    fontSize: 15,
    marginBottom: th.space.sm,
    fontFamily: th.fonts.body,

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
