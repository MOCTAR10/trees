import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { V2Response } from "../api/client";
import CoopMap from "../components/CoopMap";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

const t = fr.valorization;

interface Props {
  data: V2Response;
  origin?: { latitude: number; longitude: number } | null;
  exporting?: boolean;
  onExportPdf?: () => void;
  onBack: () => void;
}

export default function ValorizationScreen({ data, origin, exporting, onExportPdf, onBack }: Props) {
  const plan = data.valorization_plan;
  const rb = plan.residue_breakdown;
  const csr = plan.win_win_synergy_plan.logging_company_csr_benefits;
  const impact = plan.win_win_synergy_plan.community_impact_plan;
  const carbon = plan.carbon_offset_metadata.avoided_methane_emissions_co2eq_kg;
  const firstCoop = data.matched_cooperatives[0];
  const mapTarget =
    firstCoop?.latitude != null && firstCoop.longitude != null
      ? { latitude: firstCoop.latitude, longitude: firstCoop.longitude, name: firstCoop.name }
      : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t.title}</Text>

      <View style={styles.card}>
        <Text style={styles.big}>{plan.analysis_summary.species}</Text>
        <Text style={styles.metric}>
          {t.waste}: {plan.analysis_summary.total_waste_biomass_kg.toFixed(0)} kg
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.branches}</Text>
        {rb.canopy_and_branches.mass_kg != null && (
          <Text style={styles.metric}>
            {t.massKg}: {rb.canopy_and_branches.mass_kg.toFixed(0)} kg
          </Text>
        )}
        <Text style={styles.body}>{rb.canopy_and_branches.primary_recommendation}</Text>
        {rb.canopy_and_branches.technical_protocol_summary && (
          <Text style={styles.dim}>{rb.canopy_and_branches.technical_protocol_summary}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.bark}</Text>
        {rb.bark_and_organic_liquids.mass_kg != null && (
          <Text style={styles.metric}>
            {t.massKg}: {rb.bark_and_organic_liquids.mass_kg.toFixed(0)} kg
          </Text>
        )}
        <Text style={styles.body}>{rb.bark_and_organic_liquids.primary_recommendation}</Text>
        {rb.bark_and_organic_liquids.industrial_use_case && (
          <Text style={styles.dim}>{rb.bark_and_organic_liquids.industrial_use_case}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.stumpSouche}</Text>
        {rb.stump_and_roots.volume_m3 != null && (
          <Text style={styles.metric}>
            {t.volumeM3}: {rb.stump_and_roots.volume_m3.toFixed(2)} m³
          </Text>
        )}
        {rb.stump_and_roots.artisan_or_pharmaceutical_value && (
          <Text style={styles.body}>{rb.stump_and_roots.artisan_or_pharmaceutical_value}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.synergy}</Text>
        <Text style={styles.sub}>{t.csr}</Text>
        <Text style={styles.body}>{csr.fsc_criteria_met}</Text>
        <Text style={styles.body}>{csr.gabon_law_016_compliance}</Text>
        <Text style={styles.sub}>{t.community}</Text>
        <Text style={styles.body}>
          {t.coop}: {impact.target_cooperative_name ?? fr.report.unknown}
          {impact.logistical_distance_km != null &&
            ` — ${t.distance}: ${impact.logistical_distance_km.toFixed(1)} km`}
        </Text>
        <Text style={styles.body}>{impact.local_economic_value_creation_estimate}</Text>
      </View>

      {origin && mapTarget && <CoopMap origin={origin} target={mapTarget} />}

      <View style={[styles.card, styles.carbonCard]}>
        <Text style={styles.cardTitle}>{t.carbon}</Text>
        <Text style={styles.carbonValue}>
          {carbon.toFixed(0)} {t.co2eqKg}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.matchedCoops}</Text>
        {data.matched_cooperatives.map((c) => (
          <View key={c.id} style={styles.coopRow}>
            <Text style={styles.body}>
              {c.name} — {c.distance_km.toFixed(1)} km
            </Text>
            <Text style={c.is_certified ? styles.certified : styles.notCertified}>
              {c.is_certified ? t.certified : t.nonCertified}
            </Text>
          </View>
        ))}
      </View>

      {onExportPdf && (
        <TouchableOpacity style={styles.exportButton} onPress={onExportPdf} disabled={!!exporting}>
          {exporting ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.exportText}>{t.exportPlan}</Text>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.button} onPress={onBack}>
        <Text style={styles.buttonText}>{t.backToStart}</Text>
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
  big: { color: colors.text, fontSize: type.heading, fontStyle: "italic", fontWeight: "600" },
  cardTitle: { color: colors.accent, fontSize: type.heading, fontWeight: "600" },
  sub: { color: colors.textDim, fontSize: type.caption, textTransform: "uppercase", marginTop: spacing.xs },
  metric: { color: colors.success, fontSize: type.body, fontWeight: "700" },
  body: { color: colors.text, fontSize: type.body, lineHeight: 21 },
  dim: { color: colors.textDim, fontSize: type.caption, lineHeight: 18 },
  carbonCard: { borderColor: colors.success },
  carbonValue: { color: colors.success, fontSize: type.title, fontWeight: "800" },
  coopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  certified: { color: colors.success, fontSize: type.caption, fontWeight: "700" },
  notCertified: { color: colors.warning, fontSize: type.caption },
  button: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  buttonText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
  exportButton: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: "center",
  },
  exportText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
});
