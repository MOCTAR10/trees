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
  Certification,
  CertificationSummary,
  CertStatus,
  certificationSummary,
  decideCertification,
  listCertifications,
} from "../api/client";
import { fr } from "../i18n/fr";
import { exportCertificationPdf, sharePdf } from "../pdf";
import { colors, spacing, type } from "../theme";
import Badge, { certTone } from "./Badge";

type PendingDecision = { cert: Certification; action: "rejete" | "suspendu" };

const FILTERS: (CertStatus | "all")[] = ["all", "soumis", "actif", "suspendu", "expire", "rejete"];

/** Ministry view: verify, reject or suspend third-party certifications. */
export default function AdminCertifications() {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [summary, setSummary] = useState<CertificationSummary | null>(null);
  const [filter, setFilter] = useState<CertStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingDecision | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, sum] = await Promise.all([listCertifications(), certificationSummary()]);
      setCerts(rows ?? []);
      setSummary(sum);
    } catch (err) {
      console.error("certifications load failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (
    cert: Certification,
    action: "actif" | "rejete" | "suspendu",
    motif?: string,
  ) => {
    if (busyId !== null) return;
    setBusyId(cert.id);
    setMessage(null);
    try {
      await decideCertification(cert.id, action, motif ?? null);
      setMessage(
        action === "actif"
          ? fr.cert.verified
          : action === "suspendu"
            ? fr.cert.suspended
            : fr.cert.rejected,
      );
      await load();
    } catch (err) {
      console.error("certification decision failed", err);
      setMessage(fr.cert.error);
    } finally {
      setBusyId(null);
    }
  };

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

  const visible = filter === "all" ? certs : certs.filter((c) => c.status === filter);

  return (
    <View style={styles.container}>
      {summary ? (
        <View style={styles.summary}>
          <Text style={styles.summaryValue}>{summary.total_count}</Text>
          <Text style={styles.summaryLabel}>{fr.cert.summary.total}</Text>
          <View style={styles.summaryRow}>
            {summary.by_scheme.map((s) => (
              <Text key={s.scheme} style={styles.summaryChip}>
                {s.scheme} {s.count}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        contentContainerStyle={styles.filtersContent}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filter, filter === f && styles.filterOn]}
            onPress={() => setFilter(f)}
            testID={`cert-filter-${f}`}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>
              {f === "all" ? fr.cert.summary.total : (fr.cert.status[f] ?? f)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.dim}>{fr.cert.noCerts}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {visible.map((c) => (
            <View key={c.id} style={styles.card} testID={`cert-${c.id}`}>
              <View style={styles.cardTop}>
                <Text style={styles.scheme}>{`${c.scheme} · ${c.org_name ?? `#${c.org_id}`}`}</Text>
                <Badge label={fr.cert.status[c.status] ?? c.status} tone={certTone(c.status)} />
              </View>
              <Text style={styles.meta}>
                {fr.cert.type[c.cert_type] ?? c.cert_type}
                {c.title_ref ? ` · ${c.title_ref}` : ""}
              </Text>
              {c.certificate_ref ? (
                <Text style={styles.meta}>
                  {`${fr.cert.reference} : ${c.certificate_ref}`}
                </Text>
              ) : null}
              {c.valid_from || c.valid_to ? (
                <Text style={styles.meta}>
                  {`${fr.cert.validFrom} : ${c.valid_from ?? "—"} → ${c.valid_to ?? "—"}`}
                </Text>
              ) : null}
              {c.decision_motif ? <Text style={styles.meta}>{c.decision_motif}</Text> : null}
              <View style={styles.actionsRow}>
                {c.status === "soumis" ? (
                  <>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.approve]}
                      disabled={busyId === c.id}
                      onPress={() => void decide(c, "actif")}
                      testID={`cert-verify-${c.id}`}
                    >
                      <Text style={styles.smallBtnText}>{fr.cert.decide.actif}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.reject]}
                      disabled={busyId === c.id}
                      onPress={() => {
                        setMessage(null);
                        setPending({ cert: c, action: "rejete" });
                      }}
                      testID={`cert-reject-${c.id}`}
                    >
                      <Text style={styles.smallBtnText}>{fr.cert.decide.rejete}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                {c.status === "actif" ? (
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.reject]}
                    disabled={busyId === c.id}
                    onPress={() => {
                      setMessage(null);
                      setPending({ cert: c, action: "suspendu" });
                    }}
                    testID={`cert-suspend-${c.id}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.cert.decide.suspendu}</Text>
                  </TouchableOpacity>
                ) : null}
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

      <MotifModal
        pending={pending}
        onClose={() => setPending(null)}
        onConfirm={(p, motif) => {
          setPending(null);
          void decide(p.cert, p.action, motif);
        }}
      />
    </View>
  );
}

function MotifModal({
  pending,
  onClose,
  onConfirm,
}: {
  pending: PendingDecision | null;
  onClose: () => void;
  onConfirm: (pending: PendingDecision, motif: string) => void;
}) {
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMotif("");
    setError(null);
  }, [pending]);

  const confirm = () => {
    if (!pending) return;
    if (!motif.trim()) {
      setError(fr.cert.motifRequired);
      return;
    }
    onConfirm(pending, motif.trim());
  };

  return (
    <Modal visible={!!pending} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>
            {pending?.action === "suspendu" ? fr.cert.decide.suspendu : fr.cert.decide.rejete}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={fr.cert.motif}
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
              testID="cert-motif-submit"
            >
              <Text style={styles.submitText}>
                {pending?.action === "suspendu" ? fr.cert.decide.suspendu : fr.cert.decide.rejete}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summary: {
    margin: spacing.md,
    marginBottom: 0,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.xs,
  },
  summaryValue: { color: colors.accent, fontSize: type.heading, fontWeight: "800" },
  summaryLabel: { color: colors.textDim, fontSize: type.caption },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  summaryChip: {
    color: colors.text,
    fontSize: type.caption,
    fontWeight: "700",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  filters: { flexGrow: 0, marginTop: spacing.sm },
  filtersContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  filter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterText: { color: colors.textDim, fontSize: type.caption, fontWeight: "700" },
  filterTextOn: { color: colors.primary },
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
  approve: { backgroundColor: colors.success, borderColor: colors.success },
  reject: { backgroundColor: colors.error, borderColor: colors.error },
  smallBtnText: { color: colors.text, fontSize: type.caption, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(14,21,18,0.8)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
  },
  modalTitle: {
    color: colors.text,
    fontSize: type.heading,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
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
});
