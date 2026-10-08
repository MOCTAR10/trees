import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { V1Report } from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

const t = fr.report;

interface Props {
  report: V1Report;
  onValorize: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function ReportScreen({ report, onValorize }: Props) {
  const fmt = (v: number | null | undefined, unit = "", digits = 1) =>
    v == null ? t.unknown : `${v.toFixed(digits)}${unit}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t.title}</Text>

      <View style={styles.card}>
        <Text style={styles.species}>
          {report.species_scientific_name ?? t.unknown}
          {report.species_common_name_fr ? ` — ${report.species_common_name_fr}` : ""}
        </Text>
        {report.species_confidence != null && (
          <Text style={styles.caption}>
            {t.confidence}: {(report.species_confidence * 100).toFixed(0)}%
          </Text>
        )}

        <Row label={t.dbh} value={fmt(report.measured_dbh_cm, " cm")} />
        <Row label={t.height} value={fmt(report.estimated_height_m, " m")} />
        <Row label={t.age} value={fmt(report.estimated_age_years, " ans", 0)} />
        <Row label={t.model} value={report.age_model_used ?? t.unknown} />
        <Row label={t.health} value={report.health_status ?? t.unknown} />
        <Row label={t.soil} value={report.soil_type ?? t.unknown} />
        <Row label={t.canopy} value={fmt(report.canopy_density_fcd, "", 2)} />
      </View>

      {report.narrative_fr && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.narrative}</Text>
          <Text style={styles.narrative}>{report.narrative_fr}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={onValorize}>
        <Text style={styles.buttonText}>{t.toValorization}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: type.title, fontWeight: "700" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.accent, fontSize: type.heading, fontWeight: "600" },
  species: { color: colors.text, fontSize: type.heading, fontStyle: "italic" },
  caption: { color: colors.textDim, fontSize: type.caption },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  rowLabel: { color: colors.textDim, fontSize: type.body },
  rowValue: { color: colors.text, fontSize: type.body, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  narrative: { color: colors.text, fontSize: type.body, lineHeight: 22 },
  button: {
    backgroundColor: colors.accent,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: colors.primary, fontSize: type.body, fontWeight: "700" },
});
