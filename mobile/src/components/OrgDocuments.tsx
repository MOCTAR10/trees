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
  ChecklistItem,
  myOrganization,
  OrganizationDetail,
  uploadDocument,
} from "../api/client";
import { fr } from "../i18n/fr";
import Badge, { docTone } from "./Badge";
import { CardGrid, useDialog } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Company view: own organization identity + required-document checklist. */
export default function OrgDocuments() {
  const styles = useStyles();
  const theme = useTheme();
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
    return <ActivityIndicator style={styles.center} color={theme.c.olive} />;
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
        <CardGrid>
          {checklist.map((item) => (
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
          ))}
        </CardGrid>
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

export function DocumentModal({
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
  const dialog = useDialog();
  const styles = useStyles();
  const theme = useTheme();
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
    <Modal visible={!!item} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
          <Text style={styles.modalTitle}>{item?.label ?? ""}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <TextInput
              style={styles.input}
              placeholder={fr.docs.reference}
              placeholderTextColor={theme.c.muted}
              value={reference}
              onChangeText={setReference}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.docs.authority}
              placeholderTextColor={theme.c.muted}
              value={authority}
              onChangeText={setAuthority}
            />
            <TextInput
              style={styles.input}
              placeholder={fr.docs.issuedAt}
              placeholderTextColor={theme.c.muted}
              value={issuedAt}
              onChangeText={setIssuedAt}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.docs.expiresAt}
              placeholderTextColor={theme.c.muted}
              value={expiresAt}
              onChangeText={setExpiresAt}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.docs.fileUrl}
              placeholderTextColor={theme.c.muted}
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
                  <ActivityIndicator color={theme.c.forest} />
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

const useStyles = makeStyles((th) => ({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.lg, padding: th.space.xl },
  error: { color: th.c.risk, fontSize: 15, textAlign: "center", fontFamily: th.fonts.body },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  list: { padding: th.space.lg, gap: th.space.sm, paddingBottom: th.space.xxl },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: th.space.sm,
  },
  section: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
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
  name: { color: th.c.ink, fontSize: 20, fontFamily: th.fonts.display },
  docLabel: { color: th.c.ink, fontSize: 15, flex: 1, fontFamily: th.fonts.bodyBold },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  dim: { color: th.c.muted, fontSize: 15, marginTop: th.space.sm, fontFamily: th.fonts.body },
  success: { color: th.c.ok, fontSize: 15, fontFamily: th.fonts.bodyBold },
  action: {
    marginTop: th.space.sm,
    borderWidth: 1,
    borderColor: th.c.olive,
    borderRadius: 8,
    paddingVertical: th.space.sm,
    paddingHorizontal: th.space.lg,
    alignItems: "center",
    alignSelf: "flex-start",
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
