import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { processScanV1, processScanV2, V1Report, V2Response } from "./src/api/client";
import { fr } from "./src/i18n/fr";
import { sharePdf, exportPlanPdf, exportReportPdf } from "./src/pdf";
import CaptureScreen, { CaptureResult } from "./src/screens/CaptureScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ReportScreen from "./src/screens/ReportScreen";
import ValorizationScreen from "./src/screens/ValorizationScreen";
import {
  clearScans,
  deleteScan,
  loadScans,
  newScanId,
  saveScan,
  StoredScan,
  updateScanValorization,
} from "./src/storage/history";
import { colors, spacing, type } from "./src/theme";

type Phase =
  | "home"
  | "capture"
  | "analyzing"
  | "report"
  | "valorizing"
  | "valorization"
  | "error"
  | "history";

export default function App() {
  const [phase, setPhase] = useState<Phase>("home");
  const [report, setReport] = useState<V1Report | null>(null);
  const [valorization, setValorization] = useState<V2Response | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [historyReturn, setHistoryReturn] = useState(false);
  const [scans, setScans] = useState<StoredScan[]>([]);
  const [exporting, setExporting] = useState<"report" | "plan" | null>(null);

  const refreshScans = useCallback(async () => {
    setScans(await loadScans());
  }, []);

  useEffect(() => {
    refreshScans();
  }, [refreshScans]);

  const goHome = useCallback(() => {
    setReport(null);
    setValorization(null);
    setCoords(null);
    setActiveScanId(null);
    setHistoryReturn(false);
    setExporting(null);
    setPhase("home");
  }, []);

  const goHistory = useCallback(() => {
    refreshScans();
    setPhase("history");
  }, [refreshScans]);

  const handleCaptured = async (capture: CaptureResult) => {
    setPhase("analyzing");
    const scanId = newScanId();
    setActiveScanId(scanId);
    setCoords({ latitude: capture.latitude, longitude: capture.longitude });
    setHistoryReturn(false);
    try {
      const v1 = await processScanV1(capture);
      setReport(v1);
      await saveScan({
        id: scanId,
        created_at: new Date().toISOString(),
        latitude: capture.latitude,
        longitude: capture.longitude,
        report: v1,
        valorization: null,
      });
      refreshScans();
      setPhase("report");
    } catch (err) {
      console.error("V1 failed", err);
      setPhase("error");
    }
  };

  const handleValorize = async () => {
    if (!report?.species_scientific_name || !report.measured_dbh_cm || !coords) {
      setPhase("error");
      return;
    }
    setPhase("valorizing");
    try {
      const v2 = await processScanV2({
        species_scientific_name: report.species_scientific_name,
        measured_dbh_cm: report.measured_dbh_cm,
        latitude: coords.latitude,
        longitude: coords.longitude,
        canopy_density_fcd: report.canopy_density_fcd ?? undefined,
      });
      setValorization(v2);
      if (activeScanId) await updateScanValorization(activeScanId, v2);
      refreshScans();
      setPhase("valorization");
    } catch (err) {
      console.error("V2 failed", err);
      setPhase("error");
    }
  };

  const openScan = (scan: StoredScan) => {
    setReport(scan.report);
    setValorization(scan.valorization);
    setCoords({ latitude: scan.latitude, longitude: scan.longitude });
    setActiveScanId(null);
    setHistoryReturn(true);
    setPhase("report");
  };

  const handleDelete = async (id: string) => {
    await deleteScan(id);
    refreshScans();
  };

  const handleClear = async () => {
    await clearScans();
    refreshScans();
  };

  const exportReport = async () => {
    if (!report) return;
    setExporting("report");
    try {
      const uri = await exportReportPdf(report);
      await sharePdf(uri);
    } catch (err) {
      console.error("PDF report export failed", err);
      Alert.alert(fr.report.error);
    } finally {
      setExporting(null);
    }
  };

  const exportPlan = async () => {
    if (!valorization) return;
    setExporting("plan");
    try {
      const uri = await exportPlanPdf(valorization);
      await sharePdf(uri);
    } catch (err) {
      console.error("PDF plan export failed", err);
      Alert.alert(fr.valorization.error);
    } finally {
      setExporting(null);
    }
  };

  const returnTarget = () => (historyReturn ? goHistory() : goHome());

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{fr.appTitle}</Text>
        <Text style={styles.headerSubtitle}>{fr.appSubtitle}</Text>
      </View>

      {phase === "home" && (
        <HomeScreen scanCount={scans.length} onNew={() => setPhase("capture")} onHistory={goHistory} />
      )}
      {phase === "capture" && <CaptureScreen onCaptured={handleCaptured} />}
      {phase === "history" && (
        <HistoryScreen
          scans={scans}
          onOpen={openScan}
          onDelete={handleDelete}
          onClear={handleClear}
          onBack={goHome}
        />
      )}
      {phase === "report" && report && (
        <ReportScreen
          report={report}
          exporting={exporting === "report"}
          onValorize={historyReturn ? null : handleValorize}
          onOpenPlan={historyReturn && valorization ? () => setPhase("valorization") : undefined}
          onExportPdf={exportReport}
          onBack={historyReturn ? goHistory : undefined}
        />
      )}
      {phase === "valorization" && valorization && (
        <ValorizationScreen
          data={valorization}
          origin={coords}
          exporting={exporting === "plan"}
          onExportPdf={exportPlan}
          onBack={returnTarget}
        />
      )}
      {(phase === "analyzing" || phase === "valorizing") && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loading}>
            {phase === "analyzing" ? fr.capture.waiting : fr.common.loading}
          </Text>
        </View>
      )}
      {phase === "error" && (
        <View style={styles.center}>
          <Text style={styles.error}>{fr.report.error}</Text>
          <Text style={styles.link} onPress={goHome}>
            {fr.report.startOver}
          </Text>
        </View>
      )}
      {exporting && (
        <View style={styles.exporting}>
          <Text style={styles.exportingText}>{fr.common.exporting}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, position: "relative" },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.primary,
  },
  headerTitle: { color: colors.text, fontSize: type.title, fontWeight: "800" },
  headerSubtitle: { color: colors.textDim, fontSize: type.caption },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loading: { color: colors.text, fontSize: type.body },
  error: { color: colors.error, fontSize: type.body },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700", marginTop: spacing.md },
  exporting: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(14,21,18,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  exportingText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
});