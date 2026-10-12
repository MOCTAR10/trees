import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Df10Entry, getStatement, listDf10, Statement } from "../api/client";
import { exportDf10Pdf, exportStatementPdf, sharePdf } from "../pdf";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";
import Badge from "./Badge";

const QUARTERS: (number | null)[] = [null, 1, 2, 3, 4];

/** Ministry view: national DF10 register + periodic statements (read-only). */
export default function AdminTraceability() {
  const [mode, setMode] = useState<"df10" | "statements">("df10");
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [entries, setEntries] = useState<Df10Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [quarter, setQuarter] = useState<number | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [stLoading, setStLoading] = useState(false);
  const [stError, setStError] = useState<string | null>(null);

  const loadDf10 = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listDf10());
    } catch (err) {
      console.error("df10 load failed", err);
      setError(fr.traceability.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDf10();
  }, [loadDf10]);

  const loadStatement = async () => {
    const y = parseInt(year, 10);
    if (!Number.isFinite(y)) {
      setStError(fr.traceability.error);
      return;
    }
    setStLoading(true);
    setStError(null);
    try {
      setStatement(await getStatement(y, quarter));
    } catch (err) {
      console.error("statement load failed", err);
      setStError(fr.traceability.error);
    } finally {
      setStLoading(false);
    }
  };

  const exportDf10 = async () => {
    if (exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportDf10Pdf());
    } catch (err) {
      console.error("df10 export failed", err);
      setMessage(fr.traceability.error);
    } finally {
      setExporting(false);
    }
  };

  const exportStatement = async () => {
    if (exporting) return;
    const y = parseInt(year, 10);
    if (!Number.isFinite(y)) {
      setMessage(fr.traceability.error);
      return;
    }
    setExporting(true);
    setMessage(null);
    try {
      await sharePdf(await exportStatementPdf(y, quarter));
    } catch (err) {
      console.error("statement export failed", err);
      setMessage(fr.traceability.error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segBtn, mode === "df10" && styles.segOn]}
          onPress={() => setMode("df10")}
          testID="seg-df10"
        >
          <Text style={[styles.segText, mode === "df10" && styles.segTextOn]}>
            {fr.traceability.df10}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, mode === "statements" && styles.segOn]}
          onPress={() => setMode("statements")}
          testID="seg-statements"
        >
          <Text style={[styles.segText, mode === "statements" && styles.segTextOn]}>
            {fr.traceability.statements}
          </Text>
        </TouchableOpacity>
      </View>

      {message ? <Text style={styles.success}>{message}</Text> : null}

      {mode === "df10" ? (
        loading ? (
          <ActivityIndicator style={styles.center} color={colors.accent} />
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <TouchableOpacity onPress={loadDf10}>
              <Text style={styles.link}>{fr.common.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <TouchableOpacity
              style={styles.action}
              onPress={exportDf10}
              disabled={exporting}
              testID="export-df10"
            >
              <Text style={styles.actionText}>
                {exporting ? fr.common.exporting : fr.traceability.exportDf10}
              </Text>
            </TouchableOpacity>
            <Text style={styles.note}>{fr.traceability.estNote}</Text>

            {entries.length === 0 ? (
              <Text style={styles.dim}>{fr.traceability.noEntries}</Text>
            ) : (
              entries.map((entry) => (
                <View key={entry.tree_code} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.title}>
                      {entry.df10_entry_no
                        ? `${entry.df10_entry_no} · ${entry.tree_code}`
                        : entry.tree_code}
                    </Text>
                    <Badge
                      label={fr.traceability.registryStatus[entry.status] ?? entry.status}
                      tone="neutral"
                    />
                  </View>
                  <Text style={styles.meta}>
                    {entry.species_scientific_name ?? "—"}
                    {entry.measured_dbh_cm != null ? ` · Ø ${entry.measured_dbh_cm} cm` : ""}
                    {entry.aac_label ? ` · ${entry.aac_label}` : ""}
                  </Text>
                  {entry.abandon_label ? (
                    <Text style={styles.abandon}>{`${fr.traceability.abandon} : ${entry.abandon_label}`}</Text>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.filters}>
            <TextInput
              style={[styles.input, styles.yearInput]}
              placeholder={fr.traceability.year}
              placeholderTextColor={colors.textDim}
              value={year}
              onChangeText={setYear}
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.action} onPress={() => void loadStatement()} testID="load-statement">
              <Text style={styles.actionText}>{fr.traceability.load}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chips}>
            {QUARTERS.map((q) => (
              <TouchableOpacity
                key={q ?? "all"}
                style={[styles.chip, quarter === q && styles.chipOn]}
                onPress={() => setQuarter(q)}
                testID={`quarter-${q ?? "all"}`}
              >
                <Text style={[styles.chipText, quarter === q && styles.chipTextOn]}>
                  {q == null ? fr.traceability.allQuarters : `T${q}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {stLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : stError ? (
            <Text style={styles.error}>{stError}</Text>
          ) : statement ? (
            <>
              <TouchableOpacity
                style={styles.action}
                onPress={() => void exportStatement()}
                disabled={exporting}
                testID="export-statement"
              >
                <Text style={styles.actionText}>
                  {exporting ? fr.common.exporting : fr.traceability.exportStatement}
                </Text>
              </TouchableOpacity>

              <View style={styles.cellRow}>
                <View style={styles.cell}>
                  <Text style={styles.cellValue}>{String(statement.totals.stems_felled)}</Text>
                  <Text style={styles.cellLabel}>{fr.traceability.stemsFelled}</Text>
                </View>
                <View style={styles.cell}>
                  <Text style={styles.cellValue}>
                    {statement.totals.estimated_volume_m3.toFixed(3)}
                  </Text>
                  <Text style={styles.cellLabel}>{fr.traceability.estimatedVolume} (m³)</Text>
                </View>
                <View style={styles.cell}>
                  <Text style={styles.cellValue}>
                    {`${Math.round(statement.transformation_rate * 100)}%`}
                  </Text>
                  <Text style={styles.cellLabel}>{fr.traceability.transformationRate}</Text>
                </View>
              </View>

              <View style={styles.cellRow}>
                <View style={styles.cell}>
                  <Text style={styles.cellValue}>{String(statement.transport.documents)}</Text>
                  <Text style={styles.cellLabel}>{fr.traceability.transportDocs}</Text>
                </View>
                <View style={styles.cell}>
                  <Text style={styles.cellValue}>{statement.transport.volume_m3.toFixed(3)}</Text>
                  <Text style={styles.cellLabel}>{fr.traceability.transportVolume} (m³)</Text>
                </View>
              </View>

              <Text style={styles.section}>{fr.traceability.bySpecies}</Text>
              {statement.by_species.length === 0 ? (
                <Text style={styles.dim}>{fr.traceability.statementEmpty}</Text>
              ) : (
                statement.by_species.map((s) => (
                  <View key={s.species} style={styles.card}>
                    <Text style={styles.title}>{s.species}</Text>
                    <Text style={styles.meta}>
                      {`${s.stems} ${fr.traceability.stems} · ${(s.volume_m3 ?? 0).toFixed(3)} m³`}
                    </Text>
                  </View>
                ))
              )}

              {statement.abandoned.length > 0 ? (
                <>
                  <Text style={styles.section}>{fr.traceability.abandonedTitle}</Text>
                  {statement.abandoned.map((a) => (
                    <View key={a.code} style={styles.card}>
                      <Text style={styles.title}>{a.label}</Text>
                      <Text style={styles.meta}>{`${a.count}`}</Text>
                    </View>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <Text style={styles.dim}>{fr.traceability.load}</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segment: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  segText: { color: colors.textDim, fontSize: type.caption, fontWeight: "700" },
  segTextOn: { color: colors.primary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  error: { color: colors.error, fontSize: type.body, textAlign: "center" },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  note: { color: colors.textDim, fontSize: type.caption, fontStyle: "italic" },
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
  title: { color: colors.text, fontSize: type.body, fontWeight: "700", flex: 1 },
  meta: { color: colors.textDim, fontSize: type.caption },
  abandon: { color: colors.warning, fontSize: type.caption, fontWeight: "700" },
  dim: { color: colors.textDim, fontSize: type.body, marginTop: spacing.sm, textAlign: "center" },
  success: {
    color: colors.success,
    fontSize: type.body,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  action: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  actionText: { color: colors.primary, fontSize: type.caption, fontWeight: "800" },
  filters: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  yearInput: { flex: 1, marginBottom: 0 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: type.body,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
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
  cellRow: { flexDirection: "row", gap: spacing.sm },
  cell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cellValue: { color: colors.text, fontSize: type.heading, fontWeight: "800" },
  cellLabel: { color: colors.textDim, fontSize: type.caption },
  section: {
    color: colors.accent,
    fontSize: type.body,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
});
