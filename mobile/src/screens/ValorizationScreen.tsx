import { FileDown, House } from "lucide-react-native";
import React from "react";
import { ScrollView, View } from "react-native";

import { V2Response } from "../api/client";
import CoopMap from "../components/CoopMap";
import { dec } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Bullet, Button, Card, KeyValue, Pill, ScreenHeader, Stat, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.valorization;

interface Props {
  data: V2Response;
  origin?: { latitude: number; longitude: number } | null;
  exporting?: boolean;
  onExportPdf?: () => void;
  onBack: () => void;
}

function Residue({
  title,
  figure,
  recommendation,
  detail,
}: {
  title: string;
  figure?: string | null;
  recommendation?: string | null;
  detail?: string | null;
}) {
  const s = useStyles();
  return (
    <Card>
      <View style={s.residueHead}>
        <Txt variant="heading" style={s.residueTitle}>
          {title}
        </Txt>
        {figure ? (
          <Txt variant="heading" tone="ok" numeric>
            {figure}
          </Txt>
        ) : null}
      </View>
      {recommendation ? <Txt>{recommendation}</Txt> : null}
      {detail ? (
        <Txt variant="small" tone="muted">
          {detail}
        </Txt>
      ) : null}
    </Card>
  );
}

export default function ValorizationScreen({ data, origin, exporting, onExportPdf, onBack }: Props) {
  const theme = useTheme();
  const s = useStyles();
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
    <View style={s.screen}>
      <ScreenHeader eyebrow={t.title} title={plan.analysis_summary.species} onBack={onBack} backLabel={t.backToStart} />
      <ScrollView contentContainerStyle={s.content}>
        <Card raised>
          <View style={s.stats}>
            <Stat value={dec(plan.analysis_summary.total_waste_biomass_kg, 0)} unit="kg" label={t.waste} compact />
            <Stat value={dec(carbon, 0)} unit={t.co2eqKg} label={t.carbon} tone="ok" compact />
          </View>
        </Card>

        <Residue
          title={t.branches}
          figure={rb.canopy_and_branches.mass_kg != null ? `${dec(rb.canopy_and_branches.mass_kg, 0)} kg` : null}
          recommendation={rb.canopy_and_branches.primary_recommendation}
          detail={rb.canopy_and_branches.technical_protocol_summary}
        />
        <Residue
          title={t.bark}
          figure={
            rb.bark_and_organic_liquids.mass_kg != null ? `${dec(rb.bark_and_organic_liquids.mass_kg, 0)} kg` : null
          }
          recommendation={rb.bark_and_organic_liquids.primary_recommendation}
          detail={rb.bark_and_organic_liquids.industrial_use_case}
        />
        <Residue
          title={t.stumpSouche}
          figure={rb.stump_and_roots.volume_m3 != null ? `${dec(rb.stump_and_roots.volume_m3, 2)} m³` : null}
          recommendation={rb.stump_and_roots.artisan_or_pharmaceutical_value}
        />

        <Card>
          <Txt variant="heading">{t.synergy}</Txt>
          <Txt variant="label" tone="gold">
            {t.csr}
          </Txt>
          <Txt>{csr.fsc_criteria_met}</Txt>
          <Txt>{csr.gabon_law_016_compliance}</Txt>
          <Txt variant="label" tone="gold" style={s.subLabel}>
            {t.community}
          </Txt>
          <KeyValue label={t.coop} value={impact.target_cooperative_name ?? fr.report.unknown} />
          {impact.logistical_distance_km != null ? (
            <KeyValue label={t.distance} value={`${dec(impact.logistical_distance_km)} km`} />
          ) : null}
          <Txt>{impact.local_economic_value_creation_estimate}</Txt>
        </Card>

        {origin && mapTarget ? <CoopMap origin={origin} target={mapTarget} /> : null}

        <Card>
          <Txt variant="heading">{t.matchedCoops}</Txt>
          {data.matched_cooperatives.map((c) => (
            <View key={c.id} style={s.coopRow}>
              <View style={s.coopText}>
                <Txt bold numberOfLines={1}>
                  {c.name}
                </Txt>
                <Txt variant="caption" tone="muted">{`${dec(c.distance_km)} km`}</Txt>
              </View>
              <Pill tone={c.is_certified ? "ok" : "warn"} label={c.is_certified ? t.certified : t.nonCertified} />
            </View>
          ))}
        </Card>

        {plan.references && plan.references.length > 0 ? (
          <Card>
            <Txt variant="label" tone="muted">
              {t.sources}
            </Txt>
            {plan.references.map((ref) => (
              <Bullet key={ref}>{ref}</Bullet>
            ))}
          </Card>
        ) : null}

        <View style={s.actions}>
          {onExportPdf ? (
            <Button
              label={t.exportPlan}
              onPress={onExportPdf}
              loading={!!exporting}
              icon={<FileDown size={18} color={theme.c.onOlive} />}
            />
          ) : null}
          <Button
            label={t.backToStart}
            variant="secondary"
            onPress={onBack}
            icon={<House size={18} color={theme.c.olive} />}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.lg, paddingBottom: th.space.xxl },
  stats: { flexDirection: "row", gap: th.space.md },
  residueHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: th.space.sm },
  residueTitle: { flex: 1 },
  subLabel: { marginTop: th.space.sm },
  coopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.md,
    paddingVertical: th.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  coopText: { flex: 1, minWidth: 0 },
  actions: { gap: th.space.md },
}));
