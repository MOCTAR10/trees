import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { ForestChecks } from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

const t = fr.map;

export const VERDICT_COLORS: Record<string, string> = {
  conforme: "#2E9E5B",
  a_verifier: "#E0A100",
  risque_deforestation: "#D64545",
  indisponible: "#8A8F98",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/** Global Forest Watch verdict + evidence (scan report and map point). */
export default function ForestChecksCard({
  checks,
  title,
}: {
  checks: ForestChecks;
  title?: string;
}) {
  const yesNo = (v: boolean | null | undefined) => (v == null ? "—" : v ? t.yes : t.no);
  return (
    <View style={styles.card} testID="forest-checks">
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={[styles.verdict, { backgroundColor: VERDICT_COLORS[checks.verdict] ?? colors.surfaceAlt }]}>
        <Text style={styles.verdictText}>{t.verdicts[checks.verdict] ?? checks.verdict}</Text>
      </View>
      {checks.flags.map((flag) => (
        <Text key={flag} style={styles.flag}>
          • {t.flags[flag] ?? flag}
        </Text>
      ))}
      <Row
        label={t.lossYears}
        value={
          checks.loss_years == null ? "—" : checks.loss_years.length ? checks.loss_years.join(", ") : t.none
        }
      />
      <Row
        label={t.radd}
        value={
          checks.radd_alerts == null
            ? "—"
            : `${checks.radd_alerts}${checks.radd_latest ? ` (${checks.radd_latest})` : ""}`
        }
      />
      <Row label={t.naturalForest} value={yesNo(checks.natural_forest_2020)} />
      <Row label={t.protectedArea} value={checks.protected_area ?? t.none} />
      <Row label={t.concession} value={checks.logging_concession ?? t.none} />
      {checks.mapped_agb_mg_ha != null ? (
        <Row label={t.mappedBiomass} value={`${checks.mapped_agb_mg_ha.toFixed(0)} t/ha`} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.accent, fontSize: type.heading, fontWeight: "600" },
  verdict: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  verdictText: { color: "#FFFFFF", fontSize: type.body, fontWeight: "800" },
  flag: { color: colors.warning, fontSize: type.caption },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  label: { color: colors.textDim, fontSize: type.caption },
  value: { color: colors.text, fontSize: type.caption, fontWeight: "700", flexShrink: 1, textAlign: "right" },
});
