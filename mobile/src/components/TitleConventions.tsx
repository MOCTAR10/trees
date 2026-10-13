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
  ConventionStatus,
  ConventionType,
  createConvention,
  decideConvention,
  issueAttestation,
  listConventions,
  TitleConvention,
} from "../api/client";
import { fr } from "../i18n/fr";
import { exportConventionPdf, sharePdf } from "../pdf";
import { colors, spacing, type } from "../theme";
import Badge, { conventionTone } from "./Badge";

/** Conventions (provisoire / définitive) + attestation de conformité of a
 * title (Loi 016/01).
 *
 * Ministry: records a convention provisoire then définitive, closes it
 * (résiliée / expirée) and issues the attestation de conformité. Company:
 * reads the instruments and exports the PDF. Shared by CompanyTitles and
 * AdminTitles.
 */
export default function TitleConventions({
  titleId,
  mode,
}: {
  titleId: number;
  mode: "company" | "admin";
}) {
  const [conventions, setConventions] = useState<TitleConvention[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState<ConventionType | null>(null);
  const [attesting, setAttesting] = useState<TitleConvention | null>(null);
  const [terminating, setTerminating] = useState<TitleConvention | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listConventions(titleId);
      setConventions(rows ?? []);
    } catch (err) {
      console.error("conventions load failed", err);
    } finally {
      setLoading(false);
    }
  }, [titleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const terminate = async (conv: TitleConvention, status: ConventionStatus, motif: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await decideConvention(titleId, conv.id, status, motif);
      setMessage(fr.titles.convention.terminated);
      await load();
    } catch (err) {
      console.error("convention decision failed", err);
      setMessage(fr.titles.convention.error);
    } finally {
      setBusy(false);
    }
  };

  const attest = async (conv: TitleConvention, reference: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await issueAttestation(titleId, conv.id, reference);
      setMessage(fr.titles.convention.attested);
      await load();
    } catch (err) {
      console.error("attestation failed", err);
      setMessage(fr.titles.convention.error);
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async (id: number) => {
    if (exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportConventionPdf(titleId, id));
    } catch (err) {
      console.error("convention export failed", err);
      setMessage(fr.titles.convention.error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{fr.titles.convention.section}</Text>
        {mode === "admin" ? (
          <View style={styles.links}>
            <TouchableOpacity
              onPress={() => {
                setMessage(null);
                setCreating("provisoire");
              }}
              testID="conv-add-provisoire"
            >
              <Text style={styles.link}>+ {fr.titles.convention.short.provisoire}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setMessage(null);
                setCreating("definitive");
              }}
              testID="conv-add-definitive"
            >
              <Text style={styles.link}>+ {fr.titles.convention.short.definitive}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : conventions.length === 0 ? (
        <Text style={styles.dim}>{fr.titles.convention.none}</Text>
      ) : (
        conventions.map((conv) => (
          <View key={conv.id} style={styles.card} testID={`conv-${conv.id}`}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>
                {fr.titles.convention.type[conv.convention_type] ?? conv.convention_type}
              </Text>
              <Badge
                label={fr.titles.convention.status[conv.status] ?? conv.status}
                tone={conventionTone(conv.status)}
              />
            </View>
            <Text style={styles.meta}>
              {`${fr.titles.convention.reference} : ${conv.reference}`}
            </Text>
            {conv.signed_at ? (
              <Text style={styles.meta}>
                {`${fr.titles.convention.signedAt} : ${conv.signed_at.slice(0, 10)}`}
              </Text>
            ) : null}
            {conv.start_date || conv.end_date ? (
              <Text style={styles.meta}>
                {`${fr.titles.convention.period} : ${conv.start_date ?? "—"} → ${conv.end_date ?? "—"}`}
              </Text>
            ) : null}
            {conv.surface_ha != null ? (
              <Text style={styles.meta}>
                {`${fr.titles.convention.surface} : ${conv.surface_ha.toLocaleString("fr-FR")} ${fr.titles.ha}`}
              </Text>
            ) : null}
            {conv.attestation_ref ? (
              <Text style={styles.meta}>
                {`${fr.titles.convention.attestation} : ${conv.attestation_ref}`}
                {conv.attestation_issued_at ? ` (${conv.attestation_issued_at.slice(0, 10)})` : ""}
              </Text>
            ) : null}
            {conv.decision_motif ? <Text style={styles.meta}>{conv.decision_motif}</Text> : null}

            <View style={styles.actionsRow}>
              {mode === "admin" && conv.status === "active" && !conv.attestation_ref ? (
                <TouchableOpacity
                  style={[styles.smallBtn, styles.approve]}
                  disabled={busy}
                  onPress={() => {
                    setMessage(null);
                    setAttesting(conv);
                  }}
                  testID={`conv-attest-${conv.id}`}
                >
                  <Text style={styles.smallBtnText}>{fr.titles.convention.issueAttestation}</Text>
                </TouchableOpacity>
              ) : null}
              {mode === "admin" && conv.status === "active" ? (
                <TouchableOpacity
                  style={[styles.smallBtn, styles.reject]}
                  disabled={busy}
                  onPress={() => {
                    setMessage(null);
                    setTerminating(conv);
                  }}
                  testID={`conv-terminate-${conv.id}`}
                >
                  <Text style={styles.smallBtnText}>{fr.titles.convention.terminate}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.smallBtn}
                disabled={exporting}
                onPress={() => void exportPdf(conv.id)}
                testID={`conv-pdf-${conv.id}`}
              >
                <Text style={styles.smallBtnText}>{fr.titles.convention.pdf}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <CreateModal
        titleId={titleId}
        type={creating}
        onClose={() => setCreating(null)}
        onCreated={() => {
          setCreating(null);
          setMessage(fr.titles.convention.requested);
          void load();
        }}
      />

      <AttestationModal
        target={attesting}
        onClose={() => setAttesting(null)}
        onConfirm={(conv, reference) => {
          setAttesting(null);
          void attest(conv, reference);
        }}
      />

      <TerminateModal
        target={terminating}
        onClose={() => setTerminating(null)}
        onConfirm={(conv, status, motif) => {
          setTerminating(null);
          void terminate(conv, status, motif);
        }}
      />
    </View>
  );
}

function CreateModal({
  titleId,
  type,
  onClose,
  onCreated,
}: {
  titleId: number;
  type: ConventionType | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [reference, setReference] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [surface, setSurface] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (type == null) return;
    setReference("");
    setSignedAt("");
    setStart("");
    setEnd("");
    setSurface("");
    setError(null);
  }, [type]);

  const submit = async () => {
    if (type == null || busy) return;
    if (!reference.trim()) {
      setError(fr.titles.convention.reference);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ha = parseFloat(surface.replace(",", "."));
      await createConvention(titleId, {
        convention_type: type,
        reference: reference.trim(),
        signed_at: signedAt.trim() || null,
        start_date: start.trim() || null,
        end_date: end.trim() || null,
        surface_ha: Number.isFinite(ha) ? ha : null,
      });
      onCreated();
    } catch (err) {
      console.error("create convention failed", err);
      setError(fr.titles.convention.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={type != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>
            {type ? fr.titles.convention.type[type] : fr.titles.convention.section}
          </Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.titles.convention.reference}
              placeholderTextColor={colors.textDim}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
              testID="conv-reference"
            />
            <TextInput
              style={styles.input}
              placeholder={`${fr.titles.convention.signedAt} (AAAA-MM-JJ)`}
              placeholderTextColor={colors.textDim}
              value={signedAt}
              onChangeText={setSignedAt}
              testID="conv-signed"
            />
            <TextInput
              style={styles.input}
              placeholder="Début (AAAA-MM-JJ)"
              placeholderTextColor={colors.textDim}
              value={start}
              onChangeText={setStart}
              testID="conv-start"
            />
            <TextInput
              style={styles.input}
              placeholder="Fin (AAAA-MM-JJ)"
              placeholderTextColor={colors.textDim}
              value={end}
              onChangeText={setEnd}
              testID="conv-end"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.convention.surface}
              placeholderTextColor={colors.textDim}
              value={surface}
              onChangeText={setSurface}
              keyboardType="numeric"
              testID="conv-surface"
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
                testID="conv-submit"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitText}>{fr.titles.convention.requested}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AttestationModal({
  target,
  onClose,
  onConfirm,
}: {
  target: TitleConvention | null;
  onClose: () => void;
  onConfirm: (conv: TitleConvention, reference: string) => void;
}) {
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReference("");
    setError(null);
  }, [target]);

  const confirm = () => {
    if (target == null) return;
    if (!reference.trim()) {
      setError(fr.titles.convention.attestationRequired);
      return;
    }
    onConfirm(target, reference.trim());
  };

  return (
    <Modal visible={target != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.titles.convention.issueAttestation}</Text>
          <TextInput
            style={styles.input}
            placeholder={fr.titles.convention.attestationRef}
            placeholderTextColor={colors.textDim}
            value={reference}
            onChangeText={setReference}
            autoCapitalize="characters"
            testID="conv-attest-ref"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={confirm}
              testID="conv-attest-submit"
            >
              <Text style={styles.submitText}>{fr.titles.convention.issueAttestation}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TerminateModal({
  target,
  onClose,
  onConfirm,
}: {
  target: TitleConvention | null;
  onClose: () => void;
  onConfirm: (conv: TitleConvention, status: ConventionStatus, motif: string) => void;
}) {
  const [status, setStatus] = useState<ConventionStatus>("resiliee");
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus("resiliee");
    setMotif("");
    setError(null);
  }, [target]);

  const confirm = () => {
    if (target == null) return;
    if (!motif.trim()) {
      setError(fr.titles.convention.motifRequired);
      return;
    }
    onConfirm(target, status, motif.trim());
  };

  return (
    <Modal visible={target != null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.titles.convention.terminate}</Text>
          <View style={styles.chips}>
            {(["resiliee", "expiree"] as ConventionStatus[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, status === s && styles.chipOn]}
                onPress={() => setStatus(s)}
                testID={`conv-terminate-status-${s}`}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextOn]}>
                  {fr.titles.convention.status[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder={fr.titles.convention.motif}
            placeholderTextColor={colors.textDim}
            value={motif}
            onChangeText={setMotif}
            testID="conv-terminate-motif"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{fr.admin.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={confirm}
              testID="conv-terminate-submit"
            >
              <Text style={styles.submitText}>{fr.titles.convention.terminate}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.sm },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sectionTitle: { color: colors.accent, fontSize: type.body, fontWeight: "800" },
  links: { flexDirection: "row", gap: spacing.md },
  link: { color: colors.accent, fontSize: type.caption, fontWeight: "800" },
  success: { color: colors.success, fontSize: type.caption, fontWeight: "700" },
  dim: { color: colors.textDim, fontSize: type.caption },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  cardTitle: { color: colors.text, fontSize: type.body, fontWeight: "700", flexShrink: 1 },
  meta: { color: colors.textDim, fontSize: type.caption },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  smallBtn: {
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  approve: { backgroundColor: colors.success, borderColor: colors.success },
  reject: { backgroundColor: colors.error, borderColor: colors.error },
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
  form: { gap: 0 },
  chips: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: type.caption, fontWeight: "800" },
  chipTextOn: { color: colors.primary },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: type.body,
    marginBottom: spacing.sm,
  },
  error: { color: colors.error, fontSize: type.caption },
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
