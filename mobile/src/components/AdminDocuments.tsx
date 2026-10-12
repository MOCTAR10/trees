import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  DocumentType,
  LegalDocument,
  listDocumentTypes,
  listDocuments,
  listOrganizations,
  Organization,
  verifyDocument,
} from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";
import Badge, { docTone } from "./Badge";

type Filter = "soumis" | "all";

/** Ministry view: review submitted documents and validate or reject them. */
export default function AdminDocuments() {
  const [docs, setDocs] = useState<LegalDocument[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [types, setTypes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("soumis");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [documents, organizations, docTypes] = await Promise.all([
        listDocuments(),
        listOrganizations(),
        listDocumentTypes(),
      ]);
      setDocs(documents);
      setOrgs(organizations);
      setTypes(Object.fromEntries(docTypes.map((t: DocumentType) => [t.code, t.label])));
    } catch (err) {
      console.error("documents load failed", err);
      setError(fr.docs.verifyError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "all" ? docs : docs.filter((d) => d.status === "soumis")),
    [docs, filter],
  );

  const orgName = useCallback(
    (id: number) => orgs.find((o) => o.id === id)?.name ?? `#${id}`,
    [orgs],
  );

  const scopeLabel = (doc: LegalDocument) =>
    doc.scope_type === "company"
      ? orgName(doc.scope_id)
      : fr.docs.target(fr.docs.scope[doc.scope_type] ?? doc.scope_type, doc.scope_id);

  const decide = async (doc: LegalDocument, status: "valide" | "rejete") => {
    const note = (notes[doc.id] ?? "").trim();
    if (status === "rejete" && !note) return;
    setBusyId(doc.id);
    try {
      await verifyDocument(doc.id, status, note || null);
      setMessage(fr.docs.verified);
      setNotes((prev) => ({ ...prev, [doc.id]: "" }));
      await load();
    } catch (err) {
      console.error("document verify failed", err);
      setMessage(fr.docs.verifyError);
    } finally {
      setBusyId(null);
    }
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
    <View style={styles.container}>
      <View style={styles.filters}>
        {(["soumis", "all"] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterOn]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>
              {f === "soumis" ? fr.docs.filteredPending : fr.docs.filteredAll}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <ScrollView contentContainerStyle={styles.list}>
        {visible.length === 0 ? (
          <Text style={styles.dim}>{fr.docs.noDocs}</Text>
        ) : (
          visible.map((doc) => (
            <View key={doc.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.title}>{types[doc.doc_type] ?? doc.doc_type}</Text>
                <Badge label={fr.docs.status[doc.status] ?? doc.status} tone={docTone(doc.status)} />
              </View>
              <Text style={styles.meta}>{scopeLabel(doc)}</Text>
              {doc.reference ? <Text style={styles.meta}>{doc.reference}</Text> : null}
              {doc.authority ? <Text style={styles.meta}>{doc.authority}</Text> : null}
              {doc.issued_at || doc.expires_at ? (
                <Text style={styles.meta}>
                  {doc.issued_at ?? "—"} → {doc.expires_at ?? "—"}
                </Text>
              ) : null}
              {doc.notes ? <Text style={styles.note}>{doc.notes}</Text> : null}

              {doc.status === "soumis" ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder={fr.docs.notes}
                    placeholderTextColor={colors.textDim}
                    value={notes[doc.id] ?? ""}
                    onChangeText={(v) => setNotes((prev) => ({ ...prev, [doc.id]: v }))}
                  />
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.action, styles.approve]}
                      disabled={busyId === doc.id}
                      onPress={() => void decide(doc, "valide")}
                      testID={`doc-approve-${doc.id}`}
                    >
                      <Text style={styles.actionText}>{fr.docs.approve}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.action, styles.reject]}
                      disabled={busyId === doc.id}
                      onPress={() => void decide(doc, "rejete")}
                      testID={`doc-reject-${doc.id}`}
                    >
                      <Text style={styles.actionText}>{fr.docs.reject}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  error: { color: colors.error, fontSize: type.body, textAlign: "center" },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  filters: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterText: { color: colors.textDim, fontSize: type.caption, fontWeight: "700" },
  filterTextOn: { color: colors.primary },
  message: {
    color: colors.success,
    fontSize: type.caption,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  dim: { color: colors.textDim, fontSize: type.body, marginTop: spacing.sm },
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
  title: { color: colors.text, fontSize: type.body, fontWeight: "800", flex: 1 },
  meta: { color: colors.textDim, fontSize: type.caption },
  note: { color: colors.warning, fontSize: type.caption, fontWeight: "700" },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: type.body,
    marginTop: spacing.sm,
  },
  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1, borderRadius: 8, paddingVertical: spacing.sm, alignItems: "center" },
  approve: { backgroundColor: colors.success },
  reject: { backgroundColor: colors.error },
  actionText: { color: "#FFFFFF", fontSize: type.caption, fontWeight: "800" },
});
