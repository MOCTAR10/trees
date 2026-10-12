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
  ChecklistItem,
  myOrganization,
  OrganizationDetail,
  uploadDocument,
} from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";
import Badge, { docTone } from "./Badge";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Company view: own organization identity + required-document checklist. */
export default function OrgDocuments() {
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await myOrganization());
    } catch (err) {
      console.error("organization load failed", err);
      setError(String(err).includes("409") ? fr.org.noOrg : fr.org.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <ActivityIndicator style={styles.center} color={colors.accent} />;
  }
  if (error || !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? fr.org.error}</Text>
        <TouchableOpacity onPress={load}>
          <Text style={styles.link}>{fr.common.retry}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { organization, checklist } = detail;
  const okCount = checklist.filter((c) => c.status === "valide").length;

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.card}>
        <Text style={styles.name}>{organization.name}</Text>
        <Text style={styles.meta}>
          {fr.org.type[organization.org_type] ?? organization.org_type}
          {organization.profile_label ? ` · ${organization.profile_label}` : ""}
        </Text>
        {organization.registration_no ? (
          <Text style={styles.meta}>
            {fr.org.registration} : {organization.registration_no}
          </Text>
        ) : null}
        {organization.tax_id ? (
          <Text style={styles.meta}>
            {fr.org.taxId} : {organization.tax_id}
          </Text>
        ) : null}
        {organization.address ? <Text style={styles.meta}>{organization.address}</Text> : null}
      </View>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      <View style={styles.sectionRow}>
        <Text style={styles.section}>{fr.org.checklistTitle}</Text>
        <Text style={styles.meta}>{fr.org.complete(okCount, checklist.length)}</Text>
      </View>

      {checklist.length === 0 ? (
        <Text style={styles.dim}>{fr.org.allGood}</Text>
      ) : (
        checklist.map((item) => (
          <View key={item.doc_type} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.docLabel}>{item.label}</Text>
              <Badge label={fr.docs.status[item.status] ?? item.status} tone={docTone(item.status)} />
            </View>
            <TouchableOpacity
              style={styles.action}
              onPress={() => {
                setMessage(null);
                setEditing(item);
              }}
              testID={`doc-update-${item.doc_type}`}
            >
              <Text style={styles.actionText}>{fr.docs.submit}</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <DocumentModal
        item={editing}
        orgId={organization.id}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          setMessage(fr.docs.saved);
          void load();
        }}
      />
    </ScrollView>
  );
}

function DocumentModal({
  item,
  orgId,
  onClose,
  onSaved,
}: {
  item: ChecklistItem | null;
  orgId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reference, setReference] = useState("");
  const [authority, setAuthority] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReference("");
    setAuthority("");
    setIssuedAt("");
    setExpiresAt("");
    setFileUrl("");
    setError(null);
  }, [item]);

  const submit = async () => {
    if (!item || busy) return;
    if (!reference.trim()) {
      setError(fr.docs.referenceRequired);
      return;
    }
    if (issuedAt.trim() && !DATE_RE.test(issuedAt.trim())) {
      setError(fr.docs.invalidDate);
      return;
    }
    if (expiresAt.trim() && !DATE_RE.test(expiresAt.trim())) {
      setError(fr.docs.invalidDate);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadDocument({
        scope_type: "company",
        scope_id: orgId,
        doc_type: item.doc_type,
        reference: reference.trim(),
        authority: authority.trim() || null,
        issued_at: issuedAt.trim() || null,
        expires_at: expiresAt.trim() || null,
        file_url: fileUrl.trim() || null,
      });
      onSaved();
    } catch (err) {
      console.error("document upload failed", err);
      setError(fr.docs.saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{item?.label ?? ""}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.docs.reference}
              placeholderTextColor={colors.textDim}
              value={reference}
              onChangeText={setReference}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.docs.authority}
              placeholderTextColor={colors.textDim}
              value={authority}
              onChangeText={setAuthority}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.docs.issuedAt}
              placeholderTextColor={colors.textDim}
              value={issuedAt}
              onChangeText={setIssuedAt}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.docs.expiresAt}
              placeholderTextColor={colors.textDim}
              value={expiresAt}
              onChangeText={setExpiresAt}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.docs.fileUrl}
              placeholderTextColor={colors.textDim}
              value={fileUrl}
              onChangeText={setFileUrl}
              autoCapitalize="none"
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
                testID="doc-submit"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.submitText}>{fr.docs.submit}</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg },
  error: { color: colors.error, fontSize: type.body, textAlign: "center" },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  section: { color: colors.accent, fontSize: type.body, fontWeight: "800" },
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
  name: { color: colors.text, fontSize: type.heading, fontWeight: "800" },
  docLabel: { color: colors.text, fontSize: type.body, fontWeight: "700", flex: 1 },
  meta: { color: colors.textDim, fontSize: type.caption },
  dim: { color: colors.textDim, fontSize: type.body, marginTop: spacing.sm },
  success: { color: colors.success, fontSize: type.body, fontWeight: "700" },
  action: {
    marginTop: spacing.sm,
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
