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
  AdminAnomaly,
  AnomalyReviewStatus,
  AnomalySeverity,
  AnomalySummary,
  anomalySummary,
  listAdminAnomalies,
  reviewAnomaly,
} from "../api/client";
import { fr } from "../i18n/fr";
import { exportAnomaliesPdf, sharePdf } from "../pdf";
import { colors, spacing, type } from "../theme";
import Badge, { Tone } from "./Badge";

type SeverityFilter = AnomalySeverity | "all";

function severityTone(severity: AnomalySeverity): Tone {
  return severity === "hard" ? "danger" : "warning";
}

function reviewTone(status: AnomalyReviewStatus): Tone {
  if (status === "traitee") return "success";
  if (status === "ecartee") return "neutral";
  return "accent";
}

function keyOf(item: AdminAnomaly, index: number): string {
  return `${item.type}-${item.subject_key}-${index}`;
}

/** Ministry view: extended anomaly register with acknowledge / dismiss. */
export default function AdminAnomalies() {
  const [items, setItems] = useState<AdminAnomaly[]>([]);
  const [summary, setSummary] = useState<AnomalySummary | null>(null);
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<AdminAnomaly | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, sum] = await Promise.all([listAdminAnomalies(), anomalySummary()]);
      setItems(rows ?? []);
      setSummary(sum);
    } catch (err) {
      console.error("anomalies load failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (
    item: AdminAnomaly,
    status: AnomalyReviewStatus,
    motif?: string,
  ) => {
    const key = `${item.type}-${item.subject_key}`;
    if (busyKey !== null) return;
    setBusyKey(key);
    setMessage(null);
    try {
      await reviewAnomaly({
        anomaly_type: item.type,
        subject_key: item.subject_key,
        status,
        decision_motif: motif ?? null,
        title_id: item.title_id,
        aac_id: item.aac_id,
        org_id: item.org_id,
      });
      setMessage(fr.anomaly.done);
      await load();
    } catch (err) {
      console.error("anomaly review failed", err);
      setMessage(fr.anomaly.error);
    } finally {
      setBusyKey(null);
    }
  };

  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportAnomaliesPdf());
    } catch (err) {
      console.error("anomaly export failed", err);
      setMessage(fr.anomaly.error);
    } finally {
      setExporting(false);
    }
  };

  const visible = filter === "all" ? items : items.filter((i) => i.severity === filter);
  const filters: { key: SeverityFilter; label: string }[] = [
    { key: "all", label: fr.anomaly.all },
    { key: "hard", label: fr.anomaly.hard },
    { key: "warning", label: fr.anomaly.warning },
  ];

  return (
    <View style={styles.container}>
      {summary ? (
        <View style={styles.summary}>
          <View style={styles.summaryCells}>
            <View style={styles.cell}>
              <Text style={styles.cellValue}>{summary.total}</Text>
              <Text style={styles.cellLabel}>{fr.anomaly.total}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={[styles.cellValue, styles.dangerText]}>{summary.hard}</Text>
              <Text style={styles.cellLabel}>{fr.anomaly.hard}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={[styles.cellValue, styles.warnText]}>{summary.warning}</Text>
              <Text style={styles.cellLabel}>{fr.anomaly.warning}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.cellValue}>{summary.ouvertes}</Text>
              <Text style={styles.cellLabel}>{fr.anomaly.open}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        contentContainerStyle={styles.filtersContent}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filter, filter === f.key && styles.filterOn]}
            onPress={() => setFilter(f.key)}
            testID={`anomaly-filter-${f.key}`}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextOn]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.filter}
          disabled={exporting}
          onPress={() => void exportPdf()}
          testID="anomaly-export"
        >
          <Text style={styles.filterText}>{fr.anomaly.export}</Text>
        </TouchableOpacity>
      </ScrollView>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.dim}>{fr.anomaly.noAnomalies}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {visible.map((item, index) => {
            const busy = busyKey === `${item.type}-${item.subject_key}`;
            return (
              <View key={keyOf(item, index)} style={styles.card} testID={keyOf(item, index)}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>
                    {fr.anomaly.type[item.type] ?? item.label}
                  </Text>
                  <Badge
                    label={
                      item.severity === "hard" ? fr.anomaly.hard : fr.anomaly.warning
                    }
                    tone={severityTone(item.severity)}
                  />
                </View>
                <Text style={styles.meta}>{`${item.subject} — ${item.detail}`}</Text>
                {item.org_name || item.title_ref || item.aac_label ? (
                  <Text style={styles.meta}>
                    {[item.org_name, item.title_ref, item.aac_label]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                ) : null}
                {item.detected_at ? (
                  <Text style={styles.meta}>
                    {`${fr.anomaly.detectedAt} : ${item.detected_at.slice(0, 10)}`}
                  </Text>
                ) : null}
                <View style={styles.actionsRow}>
                  <Badge
                    label={fr.anomaly.review[item.review_status] ?? item.review_status}
                    tone={reviewTone(item.review_status)}
                  />
                  {item.review_status === "ouverte" ? (
                    <>
                      <TouchableOpacity
                        style={[styles.smallBtn, styles.approve]}
                        disabled={busy}
                        onPress={() => void review(item, "traitee")}
                        testID={`anomaly-ack-${keyOf(item, index)}`}
                      >
                        <Text style={styles.smallBtnText}>{fr.anomaly.acknowledge}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallBtn, styles.dismiss]}
                        disabled={busy}
                        onPress={() => {
                          setMessage(null);
                          setDismissing(item);
                        }}
                        testID={`anomaly-dismiss-${keyOf(item, index)}`}
                      >
                        <Text style={styles.smallBtnText}>{fr.anomaly.dismiss}</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={styles.smallBtn}
                      disabled={busy}
                      onPress={() => void review(item, "ouverte")}
                      testID={`anomaly-reopen-${keyOf(item, index)}`}
                    >
                      <Text style={styles.smallBtnText}>{fr.anomaly.review.ouverte}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {item.review_motif ? (
                  <Text style={styles.meta}>{item.review_motif}</Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      <MotifModal
        item={dismissing}
        onClose={() => setDismissing(null)}
        onConfirm={(item, motif) => {
          setDismissing(null);
          void review(item, "ecartee", motif);
        }}
      />
    </View>
  );
}

function MotifModal({
  item,
  onClose,
  onConfirm,
}: {
  item: AdminAnomaly | null;
  onClose: () => void;
  onConfirm: (item: AdminAnomaly, motif: string) => void;
}) {
  const [motif, setMotif] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMotif("");
    setError(null);
  }, [item]);

  const confirm = () => {
    if (!item) return;
    if (!motif.trim()) {
      setError(fr.anomaly.motifRequired);
      return;
    }
    onConfirm(item, motif.trim());
  };

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{fr.anomaly.dismiss}</Text>
          {item ? <Text style={styles.meta}>{item.subject}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder={fr.anomaly.motif}
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
              style={[styles.submitBtn, styles.dismiss]}
              onPress={confirm}
              testID="anomaly-motif-submit"
            >
              <Text style={styles.submitText}>{fr.anomaly.dismiss}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summary: { padding: spacing.md, paddingBottom: 0 },
  summaryCells: { flexDirection: "row", gap: spacing.xs },
  cell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  cellValue: { color: colors.text, fontSize: type.heading, fontWeight: "800" },
  cellLabel: { color: colors.textDim, fontSize: type.caption, textAlign: "center" },
  dangerText: { color: colors.error },
  warnText: { color: colors.warning },
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
  message: { color: colors.success, fontSize: type.caption, fontWeight: "700", margin: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dim: { color: colors.textDim, fontSize: type.body },
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
  cardTitle: { color: colors.text, fontSize: type.body, fontWeight: "700", flex: 1 },
  meta: { color: colors.textDim, fontSize: type.caption },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  smallBtn: {
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  approve: { backgroundColor: colors.success, borderColor: colors.success },
  dismiss: { backgroundColor: colors.error, borderColor: colors.error },
  smallBtnText: { color: colors.text, fontSize: type.caption, fontWeight: "800" },
  error: { color: colors.error, fontSize: type.body },
  backdrop: { flex: 1, backgroundColor: "rgba(14,21,18,0.8)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: { color: colors.text, fontSize: type.heading, fontWeight: "700" },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
  },
  cancelText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  submitBtn: { flex: 1, borderRadius: 8, paddingVertical: spacing.sm, alignItems: "center" },
  submitText: { color: "#FFFFFF", fontSize: type.body, fontWeight: "800" },
});
