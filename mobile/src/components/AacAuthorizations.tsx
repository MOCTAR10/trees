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
  AacAuthorization,
  AuthorizationType,
  decideAuthorization,
  listAuthorizations,
  notifyStartup,
  requestAuthorization,
} from "../api/client";
import { fr } from "../i18n/fr";
import { exportAuthorizationPdf, sharePdf } from "../pdf";
import { colors, spacing, type } from "../theme";
import Badge, { authTone } from "./Badge";

const TYPES: AuthorizationType[] = [
  "certificat_assiette",
  "permis_annuel_operations",
  "certificat_vente_coupe",
  "cae",
];

/** Harvest authorizations of one AAC (Loi 016/01, art. 14).
 *
 * Company: requests an authorization (assiette / PAO / vente de coupe / CAE)
 * and notifies the start of activities once delivered. Ministry: delivers or
 * rejects a pending request. Shared by CompanyTitles and AdminTitles.
 */
export default function AacAuthorizations({
  aacId,
  mode,
}: {
  aacId: number;
  mode: "company" | "admin";
}) {
  const [auths, setAuths] = useState<AacAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [motifFor, setMotifFor] = useState<AacAuthorization | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listAuthorizations(aacId);
      setAuths(rows ?? []);
    } catch (err) {
      console.error("authorizations load failed", err);
    } finally {
      setLoading(false);
    }
  }, [aacId]);

  useEffect(() => {
    void load();
  }, [load]);

  const deliver = async (auth: AacAuthorization) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await decideAuthorization(auth.id, "delivre");
      setMessage(fr.titles.auth.delivered);
      await load();
    } catch (err) {
      console.error("authorization deliver failed", err);
      setMessage(fr.titles.auth.error);
    } finally {
      setBusy(false);
    }
  };

  const reject = async (auth: AacAuthorization, motif: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await decideAuthorization(auth.id, "rejete", motif);
      setMessage(fr.titles.auth.rejected);
      await load();
    } catch (err) {
      console.error("authorization reject failed", err);
      setMessage(fr.titles.auth.error);
    } finally {
      setBusy(false);
    }
  };

  const notify = async (auth: AacAuthorization) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await notifyStartup(auth.id);
      setMessage(fr.titles.auth.notified);
      await load();
    } catch (err) {
      console.error("startup notification failed", err);
      setMessage(fr.titles.auth.error);
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async (id: number) => {
    if (exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportAuthorizationPdf(id));
    } catch (err) {
      console.error("authorization export failed", err);
      setMessage(fr.titles.auth.error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{fr.titles.auth.section}</Text>
        {mode === "company" ? (
          <TouchableOpacity
            onPress={() => {
              setMessage(null);
              setRequesting(true);
            }}
            testID={`auth-request-${aacId}`}
          >
            <Text style={styles.link}>+ {fr.titles.auth.request}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : auths.length === 0 ? (
        <Text style={styles.dim}>{fr.titles.auth.none}</Text>
      ) : (
        auths.map((auth) => (
          <View key={auth.id} style={styles.authCard} testID={`auth-${auth.id}`}>
            <View style={styles.cardTop}>
              <Text style={styles.authTitle}>
                {fr.titles.auth.type[auth.authorization_type] ?? auth.authorization_type}
              </Text>
              <Badge
                label={fr.titles.auth.status[auth.status] ?? auth.status}
                tone={authTone(auth.status)}
              />
            </View>
            {auth.reference ? (
              <Text style={styles.meta}>{`${fr.titles.auth.reference} : ${auth.reference}`}</Text>
            ) : null}
            {auth.valid_from || auth.valid_to ? (
              <Text style={styles.meta}>
                {`${fr.titles.auth.validity} : ${auth.valid_from ?? "—"} → ${auth.valid_to ?? "—"}`}
              </Text>
            ) : null}
            {auth.decision_motif ? <Text style={styles.meta}>{auth.decision_motif}</Text> : null}
            {auth.startup_notified_at ? (
              <Text style={styles.meta}>
                {`${fr.titles.auth.notifiedOn} : ${auth.startup_notified_at.slice(0, 10)}`}
              </Text>
            ) : null}

            <View style={styles.actionsRow}>
              {mode === "admin" && auth.status === "soumis" ? (
                <>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.approve]}
                    disabled={busy}
                    onPress={() => void deliver(auth)}
                    testID={`auth-deliver-${auth.id}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.titles.auth.decide.delivre}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.reject]}
                    disabled={busy}
                    onPress={() => {
                      setMessage(null);
                      setMotifFor(auth);
                    }}
                    testID={`auth-reject-${auth.id}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.titles.auth.decide.rejete}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {mode === "company" && auth.status === "delivre" && !auth.startup_notified_at ? (
                <TouchableOpacity
                  style={styles.smallBtn}
                  disabled={busy}
                  onPress={() => void notify(auth)}
                  testID={`auth-notify-${auth.id}`}
                >
                  <Text style={styles.smallBtnText}>{fr.titles.auth.notifyStartup}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.smallBtn}
                disabled={exporting}
                onPress={() => void exportPdf(auth.id)}
                testID={`auth-pdf-${auth.id}`}
              >
                <Text style={styles.smallBtnText}>{fr.titles.auth.pdf}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <RequestModal
        aacId={aacId}
        visible={requesting}
        onClose={() => setRequesting(false)}
        onCreated={() => {
          setRequesting(false);
          setMessage(fr.titles.auth.requested);
          void load();
        }}
      />

      <MotifModal
        target={motifFor}
        onClose={() => setMotifFor(null)}
        onConfirm={(auth, motif) => {
          setMotifFor(null);
          void reject(auth, motif);
        }}
      />
    </View>
  );
}

function RequestModal({
  aacId,
  visible,
  onClose,
  onCreated,
}: {
  aacId: number;
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [authType, setAuthType] = useState<AuthorizationType>("permis_annuel_operations");
  const [reference, setReference] = useState("");
  const [validTo, setValidTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setAuthType("permis_annuel_operations");
    setReference("");
    setValidTo("");
    setError(null);
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestAuthorization(aacId, {
        authorization_type: authType,
        reference: reference.trim() || null,
        valid_to: validTo.trim() || null,
      });
      onCreated();
    } catch (err) {
      console.error("authorization request failed", err);
      setError(fr.titles.auth.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.titles.auth.request}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{fr.titles.auth.typeLabel}</Text>
            <View style={styles.chips}>
              {TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, authType === t && styles.chipOn]}
                  onPress={() => setAuthType(t)}
                  testID={`auth-type-${t}`}
                >
                  <Text style={[styles.chipText, authType === t && styles.chipTextOn]}>
                    {fr.titles.auth.type[t] ?? t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder={fr.titles.auth.reference}
              placeholderTextColor={colors.textDim}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder="Validité (AAAA-MM-JJ)"
              placeholderTextColor={colors.textDim}
              value={validTo}
              onChangeText={setValidTo}
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
                testID="auth-request-submit"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitText}>{fr.titles.auth.request}</Text>
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
  target: AacAuthorization | null;
  onClose: () => void;
  onConfirm: (auth: AacAuthorization, motif: string) => void;
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
      setError(fr.titles.auth.motifRequired);
      return;
    }
    onConfirm(target, motif.trim());
  };

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.titles.auth.decide.rejete}</Text>
          <TextInput
            style={styles.input}
            placeholder={fr.titles.auth.motif}
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
              testID="auth-motif-submit"
            >
              <Text style={styles.submitText}>{fr.titles.auth.decide.rejete}</Text>
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
  },
  sectionTitle: { color: colors.accent, fontSize: type.body, fontWeight: "800" },
  link: { color: colors.accent, fontSize: type.caption, fontWeight: "800" },
  success: { color: colors.success, fontSize: type.caption, fontWeight: "700" },
  dim: { color: colors.textDim, fontSize: type.caption },
  error: { color: colors.error, fontSize: type.body, textAlign: "center" },
  authCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  authTitle: { color: colors.text, fontSize: type.caption, fontWeight: "700", flex: 1 },
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
