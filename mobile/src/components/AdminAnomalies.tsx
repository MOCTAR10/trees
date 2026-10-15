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
import { makeStyles, useTheme } from "../design/ThemeProvider";
import Badge, { Tone } from "./Badge";
import { frDate } from "../design/format";

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
  const th = useTheme();
  const styles = useStyles();
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
        <ActivityIndicator style={styles.center} color={th.c.olive} />
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
                    {`${fr.anomaly.detectedAt} : ${frDate(item.detected_at)}`}
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
  const th = useTheme();
  const styles = useStyles();
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
            placeholderTextColor={th.c.muted}
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

const useStyles = makeStyles((th) => ({
  container: { flex: 1, backgroundColor: th.c.bg },
  summary: { padding: th.space.lg, paddingBottom: 0 },
  summaryCells: { flexDirection: "row", gap: th.space.xs },
  cell: {
    flex: 1,
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingVertical: th.space.sm,
    alignItems: "center",
    gap: 2,
  },
  cellValue: { color: th.c.ink, fontSize: 19, fontFamily: th.fonts.bodyBold },
  cellLabel: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, textAlign: "center" },
  dangerText: { color: th.c.risk },
  warnText: { color: th.c.warn },
  filters: { flexGrow: 0, marginTop: th.space.sm },
  filtersContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    paddingHorizontal: th.space.lg,
  },
  filter: {
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  filterOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  filterText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  filterTextOn: { color: th.c.onOlive },
  message: { color: th.c.ok, fontSize: 12, fontFamily: th.fonts.bodyBold, margin: th.space.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body },
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
  cardTitle: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold, flex: 1 },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: th.space.sm,
    marginTop: th.space.xs,
  },
  smallBtn: {
    borderRadius: 8,
    paddingVertical: th.space.xs,
    paddingHorizontal: th.space.lg,
    backgroundColor: th.c.surface2,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  approve: { backgroundColor: th.c.ok, borderColor: th.c.ok },
  dismiss: { backgroundColor: th.c.risk, borderColor: th.c.risk },
  smallBtnText: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold },
  error: { color: th.c.risk, fontSize: 15, fontFamily: th.fonts.body },
  backdrop: { flex: 1, backgroundColor: "rgba(14,21,18,0.8)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: th.c.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: th.space.xl,
    gap: th.space.sm,
  },
  modalTitle: { color: th.c.ink, fontSize: 19, fontFamily: th.fonts.bodyBold },
  input: {
    backgroundColor: th.c.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: th.c.line,
    color: th.c.ink,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
  },
  actions: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.sm },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: th.space.sm,
    alignItems: "center",
    backgroundColor: th.c.surface2,
  },
  cancelText: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  submitBtn: { flex: 1, borderRadius: 8, paddingVertical: th.space.sm, alignItems: "center" },
  submitText: { color: "#FFFFFF", fontSize: 15, fontFamily: th.fonts.bodyBold },
}));
