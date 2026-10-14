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
  AbandonCode,
  actOnTransportDocument,
  createTransportDocument,
  Df10Entry,
  listDf10,
  listTransportDestinations,
  listTransportDocuments,
  setDf10Abandon,
  TransportDocType,
  TransportDestination,
  TransportDocument,
} from "../api/client";
import { exportDf10Pdf, exportTransportPdf, sharePdf } from "../pdf";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";
import Badge, { Tone } from "./Badge";

const FELLED = new Set(["abattu", "transporte", "receptionne", "transforme"]);
const ABANDON_CHOICES: AbandonCode[] = [
  "creux",
  "penche",
  "malade",
  "non_trouve",
  "protege",
  "hors_limite",
  "dommage",
  "autre",
];
const DOC_TYPES: TransportDocType[] = ["bordereau_roulage", "feuille_route", "specification"];

function transportTone(status: string): Tone {
  if (status === "receptionne") return "success";
  if (status === "emis") return "warning";
  return "neutral";
}

function registryTone(status: string): Tone {
  if (status === "transforme") return "success";
  if (status === "abattu" || status === "transporte") return "accent";
  if (status === "autorise") return "warning";
  return "neutral";
}

/** Company view: carnet de chantier (DF10) + transport documents. */
export default function CompanyTraceability() {
  const [mode, setMode] = useState<"df10" | "transport">("df10");

  const [entries, setEntries] = useState<Df10Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [abandonTarget, setAbandonTarget] = useState<Df10Entry | null>(null);
  const [exporting, setExporting] = useState(false);

  const [docs, setDocs] = useState<TransportDocument[]>([]);
  const [docLoading, setDocLoading] = useState(true);
  const [docError, setDocError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadDf10 = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listDf10());
    } catch (err) {
      console.error("df10 load failed", err);
      setError(fr.traceability.error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDocs = useCallback(async () => {
    setDocLoading(true);
    setDocError(null);
    try {
      setDocs(await listTransportDocuments());
    } catch (err) {
      console.error("transport load failed", err);
      setDocError(fr.traceability.error);
    } finally {
      setDocLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDf10();
    void loadDocs();
  }, [loadDf10, loadDocs]);

  const exportDf10 = async () => {
    if (exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportDf10Pdf());
    } catch (err) {
      console.error("df10 export failed", err);
      setMessage(fr.traceability.error);
    } finally {
      setExporting(false);
    }
  };

  const exportDoc = async (id: number) => {
    if (exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportTransportPdf(id));
    } catch (err) {
      console.error("transport export failed", err);
      setMessage(fr.traceability.error);
    } finally {
      setExporting(false);
    }
  };

  const advance = async (doc: TransportDocument) => {
    const next = doc.status === "brouillon" ? "emis" : "receptionne";
    setBusyId(doc.id);
    try {
      await actOnTransportDocument(doc.id, next);
      await loadDocs();
    } catch (err) {
      console.error("transport transition failed", err);
      setMessage(err instanceof Error && err.message ? err.message : fr.traceability.error);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segBtn, mode === "df10" && styles.segOn]}
          onPress={() => setMode("df10")}
          testID="seg-df10"
        >
          <Text style={[styles.segText, mode === "df10" && styles.segTextOn]}>
            {fr.traceability.df10}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, mode === "transport" && styles.segOn]}
          onPress={() => setMode("transport")}
          testID="seg-transport"
        >
          <Text style={[styles.segText, mode === "transport" && styles.segTextOn]}>
            {fr.traceability.transport}
          </Text>
        </TouchableOpacity>
      </View>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {mode === "df10" ? (
        loading ? (
          <ActivityIndicator style={styles.center} color={colors.accent} />
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <TouchableOpacity onPress={loadDf10}>
              <Text style={styles.link}>{fr.common.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <TouchableOpacity
              style={styles.action}
              onPress={exportDf10}
              disabled={exporting}
              testID="export-df10"
            >
              <Text style={styles.actionText}>
                {exporting ? fr.common.exporting : fr.traceability.exportDf10}
              </Text>
            </TouchableOpacity>
            <Text style={styles.note}>{fr.traceability.estNote}</Text>

            {entries.length === 0 ? (
              <Text style={styles.dim}>{fr.traceability.noEntries}</Text>
            ) : (
              entries.map((entry) => (
                <View key={entry.tree_code} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.title}>
                      {entry.df10_entry_no
                        ? `${entry.df10_entry_no} · ${entry.tree_code}`
                        : entry.tree_code}
                    </Text>
                    <Badge
                      label={fr.traceability.registryStatus[entry.status] ?? entry.status}
                      tone={registryTone(entry.status)}
                    />
                  </View>
                  <Text style={styles.meta}>
                    {entry.species_scientific_name ?? "—"}
                    {entry.measured_dbh_cm != null ? ` · Ø ${entry.measured_dbh_cm} cm` : ""}
                  </Text>
                  {entry.abandon_label ? (
                    <Text style={styles.abandon}>
                      {`${fr.traceability.abandonCode[entry.abandon_code ?? ""] ?? entry.abandon_label}`}
                      {entry.df10_notes ? ` — ${entry.df10_notes}` : ""}
                    </Text>
                  ) : null}
                  {entry.felled_at ? (
                    <Text style={styles.meta}>{`${fr.traceability.df10} · ${entry.felled_at.slice(0, 10)}`}</Text>
                  ) : null}
                  {!FELLED.has(entry.status) ? (
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => {
                        setMessage(null);
                        setAbandonTarget(entry);
                      }}
                      testID={`abandon-${entry.tree_code}`}
                    >
                      <Text style={styles.smallBtnText}>{fr.traceability.abandon}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        )
      ) : docLoading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : docError ? (
        <View style={styles.center}>
          <Text style={styles.error}>{docError}</Text>
          <TouchableOpacity onPress={loadDocs}>
            <Text style={styles.link}>{fr.common.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <TouchableOpacity
            style={styles.action}
            onPress={() => {
              setMessage(null);
              setCreating(true);
            }}
            testID="new-transport"
          >
            <Text style={styles.actionText}>+ {fr.traceability.newDocument}</Text>
          </TouchableOpacity>

          {docs.length === 0 ? (
            <Text style={styles.dim}>{fr.traceability.noDocuments}</Text>
          ) : (
            docs.map((doc) => (
              <View key={doc.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.title}>
                    {`${doc.reference} · ${doc.direction === "entrant" ? fr.traceability.incoming : fr.traceability.outgoing}`}
                  </Text>
                  <Badge
                    label={fr.traceability.transportStatus[doc.status] ?? doc.status}
                    tone={transportTone(doc.status)}
                  />
                </View>
                <Text style={styles.meta}>
                  {`${fr.traceability.docTypeLabel[doc.doc_type] ?? doc.doc_type} · ${doc.tree_codes.length} ${fr.traceability.stems}`}
                </Text>
                <Text style={styles.meta}>
                  {doc.from_label ? `${doc.from_label} → ${doc.to_label ?? "—"}` : "—"}
                </Text>
                {doc.direction === "entrant" && doc.org_name ? (
                  <Text style={styles.meta}>{fr.traceability.fromOrg(doc.org_name)}</Text>
                ) : doc.destination_name ? (
                  <Text style={styles.meta}>{fr.traceability.toOrg(doc.destination_name)}</Text>
                ) : null}
                <Text style={styles.meta}>
                  {`${fr.traceability.volume} : ${(doc.volume_m3 ?? 0).toFixed(3)} m³`}
                </Text>
                <View style={styles.actionsRow}>
                  {(doc.status === "brouillon" && doc.direction !== "entrant") ||
                  (doc.status === "emis" && (doc.direction === "entrant" || !doc.destination_org_id)) ? (
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.smallBtnFlex]}
                      onPress={() => void advance(doc)}
                      disabled={busyId === doc.id}
                      testID={`transport-advance-${doc.id}`}
                    >
                      <Text style={styles.smallBtnText}>
                        {doc.status === "brouillon" ? fr.traceability.issue : fr.traceability.receive}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.smallBtnFlex]}
                    onPress={() => void exportDoc(doc.id)}
                    disabled={exporting}
                    testID={`transport-pdf-${doc.id}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.traceability.pdf}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <AbandonModal
        entry={abandonTarget}
        onClose={() => setAbandonTarget(null)}
        onSaved={() => {
          setAbandonTarget(null);
          setMessage(fr.traceability.saved);
          void loadDf10();
        }}
      />
      <TransportModal
        visible={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          setMessage(fr.traceability.saved);
          void loadDocs();
        }}
      />
    </View>
  );
}

function AbandonModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: Df10Entry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState<AbandonCode>("creux");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setCode("creux");
      setNotes("");
      setError(null);
    }
  }, [entry]);

  const submit = async () => {
    if (!entry || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setDf10Abandon(entry.tree_code, { abandon_code: code, notes: notes.trim() || null });
      onSaved();
    } catch (err) {
      console.error("abandon failed", err);
      setError(fr.traceability.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!entry} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.traceability.abandonTitle}</Text>
          <Text style={styles.meta}>{entry?.tree_code}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <View style={styles.chips}>
              {ABANDON_CHOICES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, code === c && styles.chipOn]}
                  onPress={() => setCode(c)}
                >
                  <Text style={[styles.chipText, code === c && styles.chipTextOn]}>
                    {fr.traceability.abandonCode[c]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder={fr.traceability.notes}
              placeholderTextColor={colors.textDim}
              value={notes}
              onChangeText={setNotes}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.disabled]}
                onPress={submit}
                disabled={busy}
                testID="abandon-submit"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitText}>{fr.traceability.abandon}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TransportModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [docType, setDocType] = useState<TransportDocType>("bordereau_roulage");
  const [fromLabel, setFromLabel] = useState("");
  const [toLabel, setToLabel] = useState("");
  const [transporter, setTransporter] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [codes, setCodes] = useState("");
  const [destinations, setDestinations] = useState<TransportDestination[]>([]);
  const [destination, setDestination] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDocType("bordereau_roulage");
    setFromLabel("");
    setToLabel("");
    setTransporter("");
    setVehicle("");
    setCodes("");
    setDestination(null);
    setError(null);
    listTransportDestinations()
      .then(setDestinations)
      .catch(() => setDestinations([]));
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    const treeCodes = codes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (treeCodes.length === 0) {
      setError(fr.traceability.codesRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createTransportDocument({
        doc_type: docType,
        tree_codes: treeCodes,
        from_label: fromLabel.trim() || null,
        to_label: toLabel.trim() || null,
        transporter: transporter.trim() || null,
        vehicle_ref: vehicle.trim() || null,
        destination_org_id: destination,
      });
      onSaved();
    } catch (err) {
      console.error("transport create failed", err);
      setError(err instanceof Error && err.message ? err.message : fr.traceability.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.traceability.newDocument}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{fr.traceability.docType}</Text>
            <View style={styles.chips}>
              {DOC_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, docType === t && styles.chipOn]}
                  onPress={() => setDocType(t)}
                >
                  <Text style={[styles.chipText, docType === t && styles.chipTextOn]}>
                    {fr.traceability.docTypeLabel[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder={fr.traceability.treeCodes}
              placeholderTextColor={colors.textDim}
              value={codes}
              onChangeText={setCodes}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.traceability.from}
              placeholderTextColor={colors.textDim}
              value={fromLabel}
              onChangeText={setFromLabel}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.traceability.to}
              placeholderTextColor={colors.textDim}
              value={toLabel}
              onChangeText={setToLabel}
            />
            <Text style={styles.fieldLabel}>{fr.traceability.destinationOrg}</Text>
            <View style={styles.chips}>
              <TouchableOpacity
                style={[styles.chip, destination == null && styles.chipOn]}
                onPress={() => setDestination(null)}
                testID="transport-dest-none"
              >
                <Text style={[styles.chipText, destination == null && styles.chipTextOn]}>
                  {fr.traceability.destinationNone}
                </Text>
              </TouchableOpacity>
              {destinations.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.chip, destination === d.id && styles.chipOn]}
                  onPress={() => setDestination(d.id)}
                  testID={`transport-dest-${d.id}`}
                >
                  <Text style={[styles.chipText, destination === d.id && styles.chipTextOn]}>{d.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.dim}>{fr.traceability.issueNote}</Text>
            <TextInput
              style={styles.input}
              placeholder={fr.traceability.transporter}
              placeholderTextColor={colors.textDim}
              value={transporter}
              onChangeText={setTransporter}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.traceability.vehicle}
              placeholderTextColor={colors.textDim}
              value={vehicle}
              onChangeText={setVehicle}
              autoCapitalize="characters"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.disabled]}
                onPress={submit}
                disabled={busy}
                testID="transport-submit"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitText}>{fr.traceability.newDocument}</Text>
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
  container: { flex: 1 },
  segment: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  segText: { color: colors.textDim, fontSize: type.caption, fontWeight: "700" },
  segTextOn: { color: colors.primary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  error: { color: colors.error, fontSize: type.body, textAlign: "center" },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  note: { color: colors.textDim, fontSize: type.caption, fontStyle: "italic" },
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
  title: { color: colors.text, fontSize: type.body, fontWeight: "700", flex: 1 },
  meta: { color: colors.textDim, fontSize: type.caption },
  abandon: { color: colors.warning, fontSize: type.caption, fontWeight: "700" },
  dim: { color: colors.textDim, fontSize: type.body, marginTop: spacing.sm },
  success: {
    color: colors.success,
    fontSize: type.body,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  action: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  actionText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  smallBtn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  smallBtnFlex: { flex: 1, marginTop: 0 },
  smallBtnText: { color: colors.accent, fontSize: type.caption, fontWeight: "800" },
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
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
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
  disabled: { opacity: 0.6 },
});
