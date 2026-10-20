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
  CertScheme,
  CertType,
  Certification,
  declareCertification,
  ForestTitle,
  listCertifications,
  myTitles,
} from "../api/client";
import { fr } from "../i18n/fr";
import { exportCertificationPdf, sharePdf } from "../pdf";
import Badge, { certTone } from "./Badge";
import { frDate, shown } from "../design/format";
import { CardGrid, useDialog } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";

const SCHEMES: CertScheme[] = ["FSC", "PAFC", "PEFC", "OLB", "LS", "TLV"];
const TYPES: CertType[] = ["gestion_durable", "legalite_plus"];

/** Company view: declare and track its third-party certifications. */
export default function CompanyCertifications() {
  const styles = useStyles();
  const theme = useTheme();
  const [certs, setCerts] = useState<Certification[]>([]);
  const [titles, setTitles] = useState<ForestTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCerts((await listCertifications()) ?? []);
    } catch (err) {
      console.error("certifications load failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    myTitles()
      .then(setTitles)
      .catch((err) => console.error("titles load failed", err));
  }, []);

  const exportPdf = async (id: number) => {
    if (exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportCertificationPdf(id));
    } catch (err) {
      console.error("certification export failed", err);
      setMessage(fr.cert.error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => {
          setMessage(null);
          setDeclaring(true);
        }}
        testID="cert-new"
      >
        <Text style={styles.addText}>+ {fr.cert.newCert}</Text>
      </TouchableOpacity>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {loading ? (
        <ActivityIndicator style={styles.center} color={theme.c.olive} />
      ) : certs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.dim}>{fr.cert.noCerts}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <CardGrid>
            {certs.map((c) => (
              <View key={c.id} style={styles.card} testID={`cert-${c.id}`}>
                <View style={styles.cardTop}>
                  <Text style={styles.scheme}>
                    {c.scheme} · {fr.cert.type[c.cert_type] ?? c.cert_type}
                  </Text>
                  <Badge label={fr.cert.status[c.status] ?? c.status} tone={certTone(c.status)} />
                </View>
                {c.certificate_ref ? (
                  <Text style={styles.meta}>
                    {`${fr.cert.reference} : ${c.certificate_ref}`}
                  </Text>
                ) : null}
                {c.title_ref ? (
                  <Text style={styles.meta}>{`${fr.cert.title} : ${c.title_ref}`}</Text>
                ) : null}
                {c.valid_from || c.valid_to ? (
                  <Text style={styles.meta}>
                    {`${shown(fr.cert.validFrom)} : ${frDate(c.valid_from) || "—"} → ${frDate(c.valid_to) || "—"}`}
                  </Text>
                ) : null}
                {c.decision_motif ? <Text style={styles.meta}>{c.decision_motif}</Text> : null}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.smallBtn}
                    disabled={exporting}
                    onPress={() => void exportPdf(c.id)}
                    testID={`cert-pdf-${c.id}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.cert.pdf}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </CardGrid>
        </ScrollView>
      )}

      <DeclareModal
        titles={titles}
        visible={declaring}
        onClose={() => setDeclaring(false)}
        onCreated={() => {
          setDeclaring(false);
          setMessage(fr.cert.declared);
          void load();
        }}
      />
    </View>
  );
}

function DeclareModal({
  titles,
  visible,
  onClose,
  onCreated,
}: {
  titles: ForestTitle[];
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const dialog = useDialog();
  const styles = useStyles();
  const theme = useTheme();
  const [scheme, setScheme] = useState<CertScheme>("FSC");
  const [certType, setCertType] = useState<CertType>("gestion_durable");
  const [reference, setReference] = useState("");
  const [titleId, setTitleId] = useState<number | null>(null);
  const [surface, setSurface] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setScheme("FSC");
    setCertType("gestion_durable");
    setReference("");
    setTitleId(null);
    setSurface("");
    setValidFrom("");
    setValidTo("");
    setError(null);
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await declareCertification({
        scheme,
        cert_type: certType,
        certificate_ref: reference.trim() || null,
        title_id: titleId,
        surface_ha: surface.trim() ? Number(surface.replace(",", ".")) : null,
        valid_from: validFrom.trim() || null,
        valid_to: validTo.trim() || null,
      });
      onCreated();
    } catch (err) {
      console.error("certification declaration failed", err);
      setError(fr.cert.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
          <Text style={styles.modalTitle}>{fr.cert.newCert}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{fr.cert.scheme}</Text>
            <View style={styles.chips}>
              {SCHEMES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, scheme === s && styles.chipOn]}
                  onPress={() => setScheme(s)}
                  testID={`cert-scheme-${s}`}
                >
                  <Text style={[styles.chipText, scheme === s && styles.chipTextOn]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{fr.cert.certType}</Text>
            <View style={styles.chips}>
              {TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, certType === t && styles.chipOn]}
                  onPress={() => setCertType(t)}
                  testID={`cert-type-${t}`}
                >
                  <Text style={[styles.chipText, certType === t && styles.chipTextOn]}>
                    {fr.cert.type[t] ?? t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder={fr.cert.reference}
              placeholderTextColor={theme.c.muted}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
              testID="cert-reference"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.cert.surface}
              placeholderTextColor={theme.c.muted}
              value={surface}
              onChangeText={setSurface}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.cert.validFrom}
              placeholderTextColor={theme.c.muted}
              value={validFrom}
              onChangeText={setValidFrom}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.cert.validTo}
              placeholderTextColor={theme.c.muted}
              value={validTo}
              onChangeText={setValidTo}
            />

            {titles.length > 0 ? (
              <>
                <Text style={styles.fieldLabel}>{fr.cert.title}</Text>
                <View style={styles.chips}>
                  <TouchableOpacity
                    style={[styles.chip, titleId === null && styles.chipOn]}
                    onPress={() => setTitleId(null)}
                    testID="cert-title-none"
                  >
                    <Text style={[styles.chipText, titleId === null && styles.chipTextOn]}>
                      {fr.cert.noTitle}
                    </Text>
                  </TouchableOpacity>
                  {titles.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.chip, titleId === t.id && styles.chipOn]}
                      onPress={() => setTitleId(t.id)}
                      testID={`cert-title-${t.id}`}
                    >
                      <Text style={[styles.chipText, titleId === t.id && styles.chipTextOn]}>
                        {t.reference ?? `#${t.id}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.submitDisabled]}
                onPress={submit}
                disabled={busy}
                testID="cert-submit"
              >
                {busy ? (
                  <ActivityIndicator color={theme.c.forest} />
                ) : (
                  <Text style={styles.submitText}>{fr.cert.newCert}</Text>
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
  container: { flex: 1, backgroundColor: th.c.bg },
  addBtn: {
    margin: th.space.lg,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: th.c.olive,
    borderRadius: 10,
    padding: th.space.sm,
    alignItems: "center",
  },
  addText: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  success: { color: th.c.ok, fontSize: 12, margin: th.space.sm, fontFamily: th.fonts.bodyBold },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body },
  error: { color: th.c.risk, fontSize: 15, textAlign: "center", fontFamily: th.fonts.body },
  list: { padding: th.space.lg, gap: th.space.sm },
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
  scheme: { color: th.c.ink, fontSize: 15, flex: 1, fontFamily: th.fonts.bodyBold },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: th.space.sm, marginTop: th.space.xs },
  smallBtn: {
    borderRadius: 8,
    paddingVertical: th.space.xs,
    paddingHorizontal: th.space.lg,
    backgroundColor: th.c.surface2,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  smallBtnText: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold },
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
