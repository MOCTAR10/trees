import { AlertTriangle, Info } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

import { CooperativeSpace } from "../../api/client";
import { ColumnChart } from "../../design/charts";
import { CardGrid } from "../../design/layout";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Card, Pill, Stat, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";
import { aggregateAlerts, fcfa, logChart, m3 } from "./aggregate";

const t = fr.coop;

/** Cooperative summary: what its active members hold and produce, and what needs attention. */
export default function CoopOverview({ space }: { space: CooperativeSpace }) {
  const theme = useTheme();
  const s = useStyles();
  const { totals, counts } = space;
  const v = totals.volumes;
  const alerts = aggregateAlerts(totals);
  const due = totals.taxes.by_status.du ?? 0;

  return (
    <View style={s.wrap} testID="coop-overview">
      <Card style={s.note}>
        <View style={s.row}>
          <Info size={16} color={theme.c.info} />
          <Txt variant="small" style={s.flex}>
            {space.members_note}
          </Txt>
        </View>
        <Txt variant="caption" tone="muted">
          {t.countedNote}
        </Txt>
      </Card>

      <Card>
        <View style={s.stats}>
          <Stat compact value={String(counts.active)} label={t.activeMembers} testID="coop-stat-members" />
          <Stat compact value={String(totals.titles.total)} label={t.titles} testID="coop-stat-titles" />
          <Stat compact value={String(totals.aac.total)} label={t.aac} testID="coop-stat-aac" />
        </View>
        <Txt variant="caption" tone="muted">
          {t.counts(counts.active, counts.suspendue, counts.sortie)}
        </Txt>
      </Card>

      <CardGrid minColumnWidth={360} maxColumns={2}>
        <Card testID="coop-volumes">
          <Txt variant="label" tone="muted">
            {t.volumesTitle}
          </Txt>
          <View style={s.stats}>
            <Stat compact value={m3(v.declared_m3)} unit={t.m3} label={`${t.declared} · ${t.stems(v.declared_stems)}`} />
            <Stat compact value={m3(v.authorized_m3)} unit={t.m3} label={t.authorized} />
            <Stat compact value={m3(v.felled_m3)} unit={t.m3} label={`${t.felled} · ${t.stems(v.felled_stems)}`} tone="olive" testID="coop-stat-felled" />
          </View>
        </Card>

        <Card testID="coop-alerts">
          <Txt variant="label" tone="muted">
            {t.alertsTitle}
          </Txt>
          {alerts.length === 0 && due === 0 ? (
            <Txt variant="small" tone="ok">
              {t.alertsEmpty}
            </Txt>
          ) : null}
          {alerts.map((a) => (
            <View key={a.text} style={s.row}>
              <AlertTriangle size={14} color={a.tone === "risk" ? theme.c.risk : theme.c.warn} />
              <Txt variant="small" tone={a.tone} style={s.flex}>
                {a.text}
              </Txt>
            </View>
          ))}
          {due > 0 ? <Pill tone="info" label={t.taxDue(due, fcfa(totals.taxes.amount_fcfa.du ?? 0))} /> : null}
        </Card>
      </CardGrid>

      <Card testID="coop-logs">
        <Txt variant="label" tone="muted">
          {t.logsTitle}
        </Txt>
        {totals.logs.total === 0 ? (
          <Txt variant="small" tone="muted">
            {t.logsEmpty}
          </Txt>
        ) : (
          <ColumnChart data={logChart(totals)} testID="coop-logs-chart" />
        )}
      </Card>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  wrap: { gap: th.space.md },
  note: { gap: th.space.xs, backgroundColor: th.c.infoSoft, borderColor: "transparent" },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  flex: { flex: 1 },
  stats: { flexDirection: "row", gap: th.space.md },
}));
