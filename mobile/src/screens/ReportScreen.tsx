import { FileDown, Recycle } from "lucide-react-native";
import React from "react";
import { ScrollView, View } from "react-native";

import { V1Report } from "../api/client";
import ForestChecksCard from "../components/ForestChecksCard";
import { dec, signed } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Bullet, Button, Card, KeyValue, Pill, ScreenHeader, Stat, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.report;

interface Props {
  report: V1Report;
  exporting?: boolean;
  onValorize: (() => void) | null;
  onOpenPlan?: () => void;
  onExportPdf?: () => void;
  onBack?: () => void;
}

function label(map: Record<string, string>, code: string | null | undefined): string {
  if (!code) return t.unknown;
  return map[code] ?? code;
}

function distanceSource(source: V1Report["distance_source"]): string {
  if (source === "ai") return t.distanceAi;
  if (source === "qr") return t.distanceQr;
  if (source === "lidar" || source === "arcore") return t.distanceSensor;
  return t.distanceTyped;
}

export default function ReportScreen({ report, exporting, onValorize, onOpenPlan, onExportPdf, onBack }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const fmt = (v: number | null | undefined, unit = "", digits = 1) =>
    v == null ? t.unknown : `${dec(v, digits)}${unit}`;
  const heading = report.species_common_name_fr ?? report.species_scientific_name ?? t.unknown;
  const showVision =
    report.dbh_vision_cm != null &&
    report.dbh_method !== null &&
    ["tape_circumference", "caliper"].includes(report.dbh_method);

  return (
    <View style={s.screen}>
      <ScreenHeader eyebrow={t.title} title={heading} onBack={onBack} backLabel={t.back} />
      <ScrollView contentContainerStyle={s.content}>
        <Card raised testID="report-hero">
          {report.species_scientific_name ? (
            <Txt variant="small" tone="muted" style={s.sci}>
              {report.species_scientific_name}
              {report.species_confidence != null
                ? ` · ${t.confidence.toLowerCase()} ${dec(report.species_confidence * 100, 0)} %`
                : ""}
            </Txt>
          ) : null}
          <View style={s.stats}>
            <Stat
              testID="report-dbh"
              value={report.measured_dbh_cm == null ? "—" : dec(report.measured_dbh_cm)}
              unit={report.measured_dbh_cm == null ? undefined : "cm"}
              label={t.dbh}
              compact
            />
            <Stat
              value={report.estimated_height_m == null ? "—" : dec(report.estimated_height_m, 0)}
              unit={report.estimated_height_m == null ? undefined : "m"}
              label={t.height}
              compact
            />
            <Stat
              value={report.estimated_age_years == null ? "—" : dec(report.estimated_age_years, 0)}
              unit={report.estimated_age_years == null ? undefined : "ans"}
              label={t.age}
              compact
            />
          </View>
          {report.measured_dbh_cm == null ? (
            <Txt variant="small" tone="warn">
              {t.noDbh}
            </Txt>
          ) : null}
        </Card>

        {report.project_title ? (
          <Card testID="report-project">
            <Pill
              tone={report.project_id ? "ok" : "warn"}
              label={report.project_id ? t.projectAttached(report.project_title) : t.projectNotAttached(report.project_title)}
            />
            {!report.project_id && report.project_note ? (
              <Txt variant="small" tone="muted">
                {t.projectNotes[report.project_note] ?? report.project_note}
              </Txt>
            ) : null}
          </Card>
        ) : null}

        <Card testID="measurement-card">
          <Txt variant="heading">{t.measurement}</Txt>
          <KeyValue label={t.method} value={label(t.dbhMethods, report.dbh_method)} />
          {report.distance_m != null ? (
            <KeyValue
              label={t.distance}
              value={`${dec(report.distance_m, 2)} m (${distanceSource(report.distance_source)})`}
            />
          ) : null}
          {report.tree_code ? <KeyValue label={t.treeCode} value={report.tree_code} /> : null}
          {showVision ? <KeyValue label={t.visionCheck} value={fmt(report.dbh_vision_cm, " cm")} /> : null}
          {report.dbh_discrepancy_pct != null ? (
            <KeyValue label={t.discrepancy} value={`${signed(report.dbh_discrepancy_pct)} %`} />
          ) : null}
          {report.dbh_uncertainty_cm != null ? (
            <KeyValue label={t.uncertainty} value={`± ${dec(report.dbh_uncertainty_cm)} cm`} />
          ) : null}
          {report.height_method ? (
            <KeyValue label={t.heightMethod} value={label(t.heightMethods, report.height_method)} />
          ) : null}
          {report.measurement_notes && report.measurement_notes.length > 0 ? (
            <View style={s.notes}>
              <Txt variant="label" tone="muted">
                {t.quality}
              </Txt>
              {report.measurement_notes.map((code) => (
                <Bullet key={code}>{t.notes[code] ?? code}</Bullet>
              ))}
            </View>
          ) : null}
        </Card>

        <Card testID="tree-card">
          <KeyValue label={t.model} value={report.age_model_used ?? t.unknown} />
          <KeyValue label={t.health} value={report.health_status ?? t.unknown} />
          <KeyValue label={t.soil} value={report.soil_type ?? t.unknown} />
          <KeyValue label={t.canopy} value={fmt(report.canopy_density_fcd, "", 2)} />
        </Card>

        {report.species_candidates && report.species_candidates.length > 1 ? (
          <Card testID="species-candidates">
            <Txt variant="heading">{t.candidates}</Txt>
            {report.species_candidates.slice(1).map((c) => (
              <KeyValue
                key={c.scientific_name}
                label={`${c.scientific_name}${c.common_name_fr ? ` (${c.common_name_fr})` : ""}`}
                value={`${dec(c.combined * 100, 0)} %`}
              />
            ))}
          </Card>
        ) : null}

        {report.forest_checks ? <ForestChecksCard checks={report.forest_checks} title={t.forestCheck} /> : null}

        {report.co2e_kg != null ? (
          <Card testID="carbon-card">
            <Txt variant="heading">{t.carbon}</Txt>
            <Stat value={dec(report.co2e_kg / 1000, 2)} unit="t CO₂e" label={t.co2e} tone="ok" />
            <KeyValue label={t.agb} value={fmt(report.aboveground_biomass_kg, " kg", 0)} />
            <KeyValue label={t.carbonStock} value={fmt(report.carbon_stock_kg, " kg C", 0)} />
            <KeyValue label={t.co2e} value={fmt(report.co2e_kg, " kg", 0)} />
          </Card>
        ) : null}

        {report.narrative_fr ? (
          <Card>
            <Txt variant="heading">{t.narrative}</Txt>
            <Txt variant="caption" tone="muted" testID="narrative-ai">
              {t.narrativeAi}
            </Txt>
            <Txt>{report.narrative_fr}</Txt>
          </Card>
        ) : null}

        <View style={s.actions}>
          {onValorize ? (
            <Button
              label={t.toValorization}
              onPress={onValorize}
              disabled={!!exporting}
              icon={<Recycle size={18} color={theme.c.onOlive} />}
            />
          ) : null}
          {onOpenPlan ? (
            <Button label={t.openPlan} onPress={onOpenPlan} disabled={!!exporting} />
          ) : null}
          {onExportPdf ? (
            <Button
              label={t.exportReport}
              variant="secondary"
              onPress={onExportPdf}
              loading={!!exporting}
              icon={<FileDown size={18} color={theme.c.olive} />}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.lg, paddingBottom: th.space.xxl },
  sci: { fontFamily: th.fonts.bodyItalic },
  stats: { flexDirection: "row", gap: th.space.md },
  notes: { gap: th.space.xs, marginTop: th.space.xs },
  actions: { gap: th.space.md },
}));
