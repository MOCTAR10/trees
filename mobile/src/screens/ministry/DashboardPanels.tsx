import React from "react";
import { View } from "react-native";

import { DashboardOverview, StatusRollup } from "../../api/client";
import { dec } from "../../design/format";
import { makeStyles } from "../../design/ThemeProvider";
import { Card, Divider, Tone, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";

const d = fr.ministry.dash;

export function short(n: number): string {
  if (n >= 1e9) return `${dec(n / 1e9, 1)} Md`;
  if (n >= 1e6) return `${dec(n / 1e6, 1)} M`;
  if (n >= 1e4) return `${dec(n / 1e3, 0)} k`;
  return Math.round(n).toLocaleString("fr-FR");
}

function num(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function Tile({ value, label, hint, tone, testID }: { value: string; label: string; hint?: string; tone?: Tone; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.tile} testID={testID}>
      <Txt variant="title" numeric tone={tone ?? "ink"}>
        {value}
      </Txt>
      <Txt variant="small" bold>
        {label}
      </Txt>
      {hint ? (
        <Txt variant="caption" tone="muted">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

function Section({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  const s = useStyles();
  return (
    <Card style={s.section} testID={testID}>
      <Txt variant="label" tone="muted">
        {title}
      </Txt>
      {children}
    </Card>
  );
}

function Bars({ rows, testID }: { rows: { label: string; value: number; text: string }[]; testID?: string }) {
  const s = useStyles();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={s.bars} testID={testID}>
      {rows.map((r) => (
        <View key={r.label} style={s.bar}>
          <Txt variant="caption" style={s.barLabel} numberOfLines={1}>
            {r.label}
          </Txt>
          <View style={s.track}>
            <View style={[s.fill, { width: `${(r.value / max) * 100}%` }]} />
          </View>
          <Txt variant="caption" bold numeric style={s.barValue}>
            {r.text}
          </Txt>
        </View>
      ))}
    </View>
  );
}

function rollupRows(map: Record<string, StatusRollup> | undefined, labels: Record<string, string>) {
  return Object.values(map ?? {})
    .filter((r) => num(r.count) > 0)
    .map((r) => ({ label: labels[r.status] ?? r.status.charAt(0).toUpperCase() + r.status.slice(1).replace(/_/g, " "), value: num(r.count), text: String(num(r.count)) }));
}

function Ratio({ label, part, total, testID }: { label: string; part: number; total: number; testID?: string }) {
  const s = useStyles();
  const pct = total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0;
  return (
    <View style={s.ratio} testID={testID}>
      <View style={s.ratioHead}>
        <Txt variant="small">{label}</Txt>
        <Txt variant="small" bold numeric>{`${pct} %`}</Txt>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

export function DashboardTiles({ overview: o }: { overview: DashboardOverview }) {
  const s = useStyles();
  const schemes = o.certifications?.by_scheme ?? [];
  return (
    <View style={s.stack} testID="ministry-panels">
      <View style={s.grid}>
        <Tile testID="tile-stems" value={short(num(o.harvest?.registry_stems))} label={d.stems} hint={d.stemsHint(num(o.harvest?.stems_felled))} />
        <Tile testID="tile-titles" value={short(num(o.titles?.total))} label={d.titles} hint={d.surface(short(num(o.titles?.surface_ha)))} />
        <Tile testID="tile-aac" value={short(num(o.aac?.total))} label={d.aac} hint={d.possibility(short(num(o.aac?.possibility_m3)))} />
        <Tile testID="tile-transport" value={short(num(o.transport?.documents))} label={d.transport} hint={d.volume(short(num(o.transport?.volume_m3)))} />
        <Tile
          testID="tile-expired"
          value={String(num(o.documents?.expired))}
          label={d.expired}
          hint={d.expiring(num(o.documents?.expiring_soon))}
          tone={num(o.documents?.expired) > 0 ? "risk" : "ok"}
        />
        <Tile testID="tile-certs" value={String(num(o.certifications?.total))} label={d.certs} hint={d.schemes(schemes.length)} />
        <Tile testID="tile-community" value={String(num(o.community?.active))} label={d.community} hint={d.agreements(num(o.community?.agreements))} />
        <Tile testID="tile-carbon-scans" value={short(num(o.carbon?.scans))} label={d.scans} hint={d.linked(num(o.carbon?.linked_scans))} />
      </View>
    </View>
  );
}

export default function DashboardPanels({ overview: o }: { overview: DashboardOverview }) {
  const s = useStyles();
  const species = (o.harvest?.by_species ?? []).slice(0, 6);
  const treeStatus = Object.entries(o.harvest?.by_status ?? {}).filter(([, n]) => num(n) > 0);
  const schemes = o.certifications?.by_scheme ?? [];
  const carbonByAac = (o.carbon?.by_aac ?? []).slice(0, 5);
  const overdueAmount = num(o.taxes?.overdue_amount_fcfa);
  const transformation = Math.round(num(o.harvest?.transformation_rate) * 100);

  return (
    <View style={s.sections} testID="ministry-details">
      <Section title={d.exploitation} testID="panel-exploitation">
        <Ratio label={d.transformation} part={transformation} total={100} testID="ratio-transformation" />
        {species.length ? (
          <>
            <Txt variant="caption" tone="muted">
              {d.bySpecies}
            </Txt>
            <Bars rows={species.map((r) => ({ label: r.species, value: num(r.volume_m3), text: `${short(num(r.volume_m3))} m³` }))} testID="bars-species" />
          </>
        ) : null}
        {treeStatus.length ? (
          <>
            <Divider />
            <Txt variant="caption" tone="muted">
              {d.byStatus}
            </Txt>
            <Bars rows={treeStatus.map(([k, n]) => ({ label: d.treeStatus[k] ?? k, value: num(n), text: String(num(n)) }))} testID="bars-tree-status" />
          </>
        ) : null}
      </Section>

      <Section title={d.registry} testID="panel-registry">
        <Txt variant="caption" tone="muted">
          {d.titlesByStatus}
        </Txt>
        <Bars rows={rollupRows(o.titles?.by_status, d.titleStatus)} />
        <Divider />
        <Txt variant="caption" tone="muted">
          {d.aacByStatus}
        </Txt>
        <Bars rows={rollupRows(o.aac?.by_status, d.aacStatus)} />
      </Section>

      <Section title={d.compliance} testID="panel-compliance">
        <Ratio
          label={d.docsValid}
          part={Math.max(0, num(o.documents?.total) - num(o.documents?.expired))}
          total={num(o.documents?.total)}
          testID="ratio-docs"
        />
        <Bars rows={rollupRows(o.documents?.by_status, d.docStatus)} />
        {schemes.length ? (
          <>
            <Divider />
            <Txt variant="caption" tone="muted">
              {d.certsByScheme}
            </Txt>
            <Bars rows={schemes.map((r) => ({ label: r.scheme, value: num(r.count), text: `${r.count} · ${short(num(r.surface_ha))} ha` }))} />
          </>
        ) : null}
      </Section>

      <Section title={d.fiscal} testID="panel-fiscal">
        <View style={s.grid}>
          <Tile value={String(num(o.taxes?.dues_total))} label={d.dues} />
          <Tile value={String(num(o.taxes?.settled))} label={d.settled} tone="ok" />
          <Tile
            value={String(num(o.taxes?.overdue))}
            label={d.late}
            tone={num(o.taxes?.overdue) > 0 ? "risk" : "ok"}
            hint={overdueAmount ? `${short(overdueAmount)} FCFA` : undefined}
          />
          <Tile value={short(num(o.taxes?.receipts_amount_fcfa))} label={d.received} hint={d.receiptsCount(num(o.taxes?.receipts))} tone="ok" />
        </View>
        <Ratio label={d.recovery} part={num(o.taxes?.settled)} total={num(o.taxes?.dues_total)} testID="ratio-recovery" />
      </Section>

      <Section title={d.social} testID="panel-social">
        <View style={s.grid}>
          <Tile value={String(num(o.community?.agreements))} label={d.agreementsLabel} hint={d.active(num(o.community?.active))} />
          <Tile value={short(num(o.community?.contribution_fcfa))} label={d.contribution} hint="FCFA" />
          <Tile value={dec(num(o.community?.avg_fdl_rate), 0)} label={d.fdl} hint="FCFA / m³" />
          <Tile value={short(num(o.community?.annual_volume_m3))} label={d.annualVolume} hint="m³" />
        </View>
      </Section>

      {carbonByAac.length ? (
        <Section title={d.carbonByAac} testID="panel-carbon">
          <Bars rows={carbonByAac.map((r) => ({ label: r.aac_label, value: num(r.co2e_kg), text: `${short(num(r.co2e_kg) / 1000)} t` }))} />
        </Section>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  stack: { gap: th.space.md },
  sections: { flexDirection: "row", flexWrap: "wrap", gap: th.space.md, alignItems: "flex-start" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: th.space.sm },
  tile: {
    flexGrow: 1,
    flexBasis: "23%",
    minWidth: 140,
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.md,
    gap: 2,
  },
  section: { padding: th.space.md, gap: th.space.sm, flexGrow: 1, flexBasis: 420, minWidth: 280 },
  bars: { gap: th.space.xs },
  bar: { flexDirection: "row", alignItems: "center", gap: th.space.sm, minHeight: 28 },
  barLabel: { width: 112 },
  barValue: { minWidth: 64, textAlign: "right" },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: th.c.surface2, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: th.c.olive },
  ratio: { gap: 4 },
  ratioHead: { flexDirection: "row", justifyContent: "space-between" },
}));
