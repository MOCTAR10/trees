import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { processScanV1, processScanV2, V1Report, V2Response } from "./src/api/client";
import { fr } from "./src/i18n/fr";
import CaptureScreen, { CaptureResult } from "./src/screens/CaptureScreen";
import ReportScreen from "./src/screens/ReportScreen";
import ValorizationScreen from "./src/screens/ValorizationScreen";
import { colors, spacing, type } from "./src/theme";

type Phase = "capture" | "analyzing" | "report" | "valorizing" | "valorization" | "error";

export default function App() {
  const [phase, setPhase] = useState<Phase>("capture");
  const [report, setReport] = useState<V1Report | null>(null);
  const [valorization, setValorization] = useState<V2Response | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const handleCaptured = async (capture: CaptureResult) => {
    setPhase("analyzing");
    setCoords({ latitude: capture.latitude, longitude: capture.longitude });
    try {
      const v1 = await processScanV1(capture);
      setReport(v1);
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
      setPhase("valorization");
    } catch (err) {
      console.error("V2 failed", err);
      setPhase("error");
    }
  };

  const reset = () => {
    setReport(null);
    setValorization(null);
    setPhase("capture");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{fr.appTitle}</Text>
        <Text style={styles.headerSubtitle}>{fr.appSubtitle}</Text>
      </View>

      {phase === "capture" && <CaptureScreen onCaptured={handleCaptured} />}
      {phase === "report" && report && (
        <ReportScreen report={report} onValorize={handleValorize} />
      )}
      {phase === "valorization" && valorization && (
        <ValorizationScreen data={valorization} onBack={reset} />
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
          <Text style={styles.link} onPress={reset}>
            {fr.report.startOver}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
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
});
