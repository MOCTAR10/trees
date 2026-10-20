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
import { CardGrid } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import Badge from "./Badge";

const QUARTERS: (number | null)[] = [null, 1, 2, 3, 4];

/** Ministry view: national DF10 register + periodic statements (read-only). */
export default function AdminTraceability() {
  const th = useTheme();
  const styles = useStyles();
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
          <ActivityIndicator style={styles.center} color={th.c.olive} />
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
              <CardGrid>
                {entries.map((entry) => (
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
                ))}
              </CardGrid>
            )}
          </ScrollView>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.filters}>
            <TextInput
              style={[styles.input, styles.yearInput]}
              placeholder={fr.traceability.year}
              placeholderTextColor={th.c.muted}
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
            <ActivityIndicator color={th.c.olive} />
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

const useStyles = makeStyles((th) => ({
  container: { flex: 1 },
  segment: {
    flexDirection: "row",
    gap: th.space.xs,
    padding: th.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: th.space.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  segOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  segText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  segTextOn: { color: th.c.onOlive },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: th.space.lg },
  error: { color: th.c.risk, fontSize: 15, fontFamily: th.fonts.body, textAlign: "center" },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  list: { padding: th.space.lg, gap: th.space.sm, paddingBottom: th.space.xxl },
  note: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, fontStyle: "italic" },
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
  abandon: { color: th.c.warn, fontSize: 12, fontFamily: th.fonts.bodyBold },
  dim: { color: th.c.muted, fontSize: 15, fontFamily: th.fonts.body, marginTop: th.space.sm, textAlign: "center" },
  success: {
    color: th.c.ok,
    fontSize: 15,
    fontFamily: th.fonts.bodyBold,
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.sm,
  },
  action: {
    backgroundColor: th.c.olive,
    borderRadius: 10,
    paddingVertical: th.space.sm,
    paddingHorizontal: th.space.lg,
    alignItems: "center",
  },
  actionText: { color: th.c.onOlive, fontSize: 12, fontFamily: th.fonts.bodyBold },
  filters: { flexDirection: "row", gap: th.space.sm, alignItems: "center" },
  yearInput: { flex: 1, marginBottom: 0 },
  input: {
    backgroundColor: th.c.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
    color: th.c.ink,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    fontSize: 15,
    fontFamily: th.fonts.body,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
  chip: {
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.bg,
  },
  chipOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  chipText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.bodyBold },
  chipTextOn: { color: th.c.onOlive },
  cellRow: { flexDirection: "row", gap: th.space.sm },
  cell: {
    flex: 1,
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  cellValue: { color: th.c.ink, fontSize: 19, fontFamily: th.fonts.bodyBold },
  cellLabel: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  section: {
    color: th.c.olive,
    fontSize: 15,
    fontFamily: th.fonts.bodyBold,
    marginTop: th.space.sm,
  },
}));
