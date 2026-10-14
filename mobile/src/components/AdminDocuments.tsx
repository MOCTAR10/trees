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
import { makeStyles, useTheme } from "../design/ThemeProvider";
import Badge, { docTone } from "./Badge";

type Filter = "soumis" | "all";

/** Ministry view: review submitted documents and validate or reject them. */
export default function AdminDocuments() {
  const th = useTheme();
  const styles = useStyles();
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
    return <ActivityIndicator style={styles.center} color={th.c.olive} />;
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
                    placeholderTextColor={th.c.muted}
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

const useStyles = makeStyles((th) => ({
  container: { flex: 1, backgroundColor: th.c.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: th.space.lg,
    padding: th.space.xl,
  },
  error: { color: th.c.risk, fontSize: 15, fontFamily: th.fonts.body, textAlign: "center" },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  filters: {
    flexDirection: "row",
    gap: th.space.sm,
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.sm,
  },
  filterChip: {
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  filterOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  filterText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  filterTextOn: { color: th.c.onOlive },
  message: {
    color: th.c.ok,
    fontSize: 12,
    fontFamily: th.fonts.bodyBold,
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.sm,
  },
  list: { padding: th.space.lg, gap: th.space.sm, paddingBottom: th.space.xxl },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body, marginTop: th.space.sm },
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
  title: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold, flex: 1 },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  note: { color: th.c.warn, fontSize: 12, fontFamily: th.fonts.bodyBold },
  input: {
    backgroundColor: th.c.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    color: th.c.ink,
    fontSize: 15,
    fontFamily: th.fonts.body,
    marginTop: th.space.sm,
  },
  actionsRow: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.sm },
  action: { flex: 1, borderRadius: 8, paddingVertical: th.space.sm, alignItems: "center" },
  approve: { backgroundColor: th.c.ok },
  reject: { backgroundColor: th.c.risk },
  actionText: { color: "#FFFFFF", fontSize: 12, fontFamily: th.fonts.bodyBold },
}));
