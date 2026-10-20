import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import Badge, { Tone } from "./Badge";
import { frDate } from "../design/format";
import { CardGrid, useDialog } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";

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

function FilterChip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  const styles = useStyles();
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      style={[styles.fchip, on && styles.fchipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.fchipText, on && styles.fchipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function registryTone(status: string): Tone {
  if (status === "transforme") return "success";
  if (status === "abattu" || status === "transporte") return "accent";
  if (status === "autorise") return "warning";
  return "neutral";
}

/** Company view: carnet de chantier (DF10) + transport documents. */
export default function CompanyTraceability() {
  const styles = useStyles();
  const theme = useTheme();
  const [mode, setMode] = useState<"df10" | "transport">("df10");

  const [entries, setEntries] = useState<Df10Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [abandonTarget, setAbandonTarget] = useState<Df10Entry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [aacFilter, setAacFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

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

  const aacOptions = useMemo(() => {
    const seen = new Map<number, string>();
    entries.forEach((e) => {
      if (e.aac_id != null && !seen.has(e.aac_id)) seen.set(e.aac_id, e.aac_label ?? `AAC ${e.aac_id}`);
    });
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [entries]);
  const statusOptions = useMemo(() => [...new Set(entries.map((e) => e.status))], [entries]);
  const shown = useMemo(
    () =>
      entries.filter(
        (e) => (aacFilter == null || e.aac_id === aacFilter) && (statusFilter == null || e.status === statusFilter),
      ),
    [entries, aacFilter, statusFilter],
  );
  const filtering = aacFilter != null || statusFilter != null;

  const exportDf10 = async () => {
    if (exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportDf10Pdf({ aac_id: aacFilter, status: statusFilter }));
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
          <ActivityIndicator style={styles.center} color={theme.c.olive} />
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
                {exporting ? fr.common.exporting : filtering ? fr.traceability.exportFiltered : fr.traceability.exportDf10}
              </Text>
            </TouchableOpacity>
            <Text style={styles.note}>{fr.traceability.estNote}</Text>

            {aacOptions.length >= 1 ? (
              <View style={styles.filterBlock} testID="df10-aac-filter">
                <Text style={styles.filterLabel}>{fr.traceability.filterChantier}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fchipRow}>
                  <FilterChip label={fr.traceability.filterAll} on={aacFilter == null} onPress={() => setAacFilter(null)} testID="aac-all" />
                  {aacOptions.map((o) => (
                    <FilterChip
                      key={o.id}
                      label={o.label}
                      on={aacFilter === o.id}
                      onPress={() => setAacFilter(aacFilter === o.id ? null : o.id)}
                      testID={`aac-${o.id}`}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {statusOptions.length > 1 ? (
              <View style={styles.filterBlock} testID="df10-status-filter">
                <Text style={styles.filterLabel}>{fr.traceability.filterStatus}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fchipRow}>
                  <FilterChip label={fr.traceability.filterAll} on={statusFilter == null} onPress={() => setStatusFilter(null)} testID="status-all" />
                  {statusOptions.map((st) => (
                    <FilterChip
                      key={st}
                      label={fr.traceability.registryStatus[st] ?? st}
                      on={statusFilter === st}
                      onPress={() => setStatusFilter(statusFilter === st ? null : st)}
                      testID={`status-${st}`}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {filtering ? (
              <Text style={styles.note} testID="df10-count">
                {fr.traceability.filterCount(shown.length, entries.length)}
              </Text>
            ) : null}

            {entries.length === 0 ? (
              <Text style={styles.dim}>{fr.traceability.noEntries}</Text>
            ) : (
              <CardGrid>
                {shown.map((entry) => (
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
                      <Text style={styles.meta}>{`${fr.traceability.df10} · ${frDate(entry.felled_at)}`}</Text>
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
                ))}
              </CardGrid>
            )}
          </ScrollView>
        )
      ) : docLoading ? (
        <ActivityIndicator style={styles.center} color={theme.c.olive} />
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
            <CardGrid>
              {docs.map((doc) => (
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
              ))}
            </CardGrid>
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
  const dialog = useDialog();
  const styles = useStyles();
  const theme = useTheme();
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
    <Modal visible={!!entry} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
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
              placeholderTextColor={theme.c.muted}
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
                  <ActivityIndicator color={theme.c.forest} />
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
  const dialog = useDialog();
  const styles = useStyles();
  const theme = useTheme();
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
    <Modal visible={visible} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
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
              placeholderTextColor={theme.c.muted}
              value={codes}
              onChangeText={setCodes}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.traceability.from}
              placeholderTextColor={theme.c.muted}
              value={fromLabel}
              onChangeText={setFromLabel}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.traceability.to}
              placeholderTextColor={theme.c.muted}
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
              placeholderTextColor={theme.c.muted}
              value={transporter}
              onChangeText={setTransporter}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.traceability.vehicle}
              placeholderTextColor={theme.c.muted}
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
                  <ActivityIndicator color={theme.c.forest} />
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

const useStyles = makeStyles((th) => ({
  container: { flex: 1 },
  segment: {
    flexDirection: "row",
    gap: 3,
    padding: 3,
    marginHorizontal: th.space.lg,
    marginTop: th.space.md,
    borderRadius: th.radius.md,
    backgroundColor: th.c.surface2,
    alignSelf: "stretch",
    maxWidth: 640,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    borderRadius: th.radius.sm + 2,
  },
  segOn: { backgroundColor: th.c.surface, borderWidth: 1, borderColor: th.c.line },
  segText: { color: th.c.muted, fontSize: 14, fontFamily: th.fonts.body },
  segTextOn: { color: th.c.olive, fontFamily: th.fonts.bodyBold },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.lg },
  error: { color: th.c.risk, fontSize: 15, textAlign: "center", fontFamily: th.fonts.body },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  list: { padding: th.space.lg, gap: th.space.sm, paddingBottom: th.space.xxl },
  note: { color: th.c.muted, fontSize: 12, fontStyle: "italic", fontFamily: th.fonts.body },
  filterBlock: { gap: 4 },
  filterLabel: { color: th.c.goldInk, fontSize: 12, letterSpacing: 1, fontFamily: th.fonts.displaySemi, textTransform: "uppercase" },
  fchipRow: { gap: 8, paddingVertical: 2 },
  fchip: {
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  fchipOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  fchipText: { color: th.c.ink, fontSize: 13, fontFamily: th.fonts.bodyBold },
  fchipTextOn: { color: th.c.onOlive },
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
  title: { color: th.c.ink, fontSize: 15, flex: 1, fontFamily: th.fonts.bodyBold },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  abandon: { color: th.c.warn, fontSize: 12, fontFamily: th.fonts.bodyBold },
  dim: { color: th.c.muted, fontSize: 15, marginTop: th.space.sm, fontFamily: th.fonts.body },
  success: {
    color: th.c.ok,
    fontSize: 15,
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.sm,
    fontFamily: th.fonts.bodyBold,

  },
  action: {
    backgroundColor: th.c.olive,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: th.space.xl,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  actionText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  actionsRow: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.xs },
  smallBtn: {
    backgroundColor: th.c.surface2,
    borderWidth: 1,
    borderColor: th.c.line,
    borderRadius: 8,
    paddingVertical: th.space.sm,
    paddingHorizontal: th.space.lg,
    alignItems: "center",
    marginTop: th.space.xs,
  },
  smallBtnFlex: { flex: 1, marginTop: 0 },
  smallBtnText: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
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
  modalActions: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.sm },
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
  disabled: { opacity: 0.6 },
}));
