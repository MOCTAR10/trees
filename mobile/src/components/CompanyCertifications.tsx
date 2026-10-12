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
import { colors, spacing, type } from "../theme";
import Badge, { certTone } from "./Badge";

const SCHEMES: CertScheme[] = ["FSC", "PAFC", "PEFC", "OLB", "LS", "TLV"];
const TYPES: CertType[] = ["gestion_durable", "legalite_plus"];

/** Company view: declare and track its third-party certifications. */
export default function CompanyCertifications() {
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
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : certs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.dim}>{fr.cert.noCerts}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
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
                  {`${fr.cert.validFrom} : ${c.valid_from ?? "—"} → ${c.valid_to ?? "—"}`}
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
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
              placeholderTextColor={colors.textDim}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
              testID="cert-reference"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.cert.surface}
              placeholderTextColor={colors.textDim}
              value={surface}
              onChangeText={setSurface}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.cert.validFrom}
              placeholderTextColor={colors.textDim}
              value={validFrom}
              onChangeText={setValidFrom}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.cert.validTo}
              placeholderTextColor={colors.textDim}
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
                  <ActivityIndicator color={colors.primary} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  addBtn: {
    margin: spacing.md,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    padding: spacing.sm,
    alignItems: "center",
  },
  addText: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  success: { color: colors.success, fontSize: type.caption, fontWeight: "700", margin: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dim: { color: colors.textDim, fontSize: type.body },
  error: { color: colors.error, fontSize: type.body, textAlign: "center" },
  list: { padding: spacing.md, gap: spacing.sm },
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
  scheme: { color: colors.text, fontSize: type.body, fontWeight: "700", flex: 1 },
  meta: { color: colors.textDim, fontSize: type.caption },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  smallBtn: {
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallBtnText: { color: colors.text, fontSize: type.caption, fontWeight: "800" },
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
