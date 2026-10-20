import { Info } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";

import { CoopMemberDetail as Detail, getCoopMember } from "../../api/client";
import { ColumnChart } from "../../design/charts";
import { CardGrid } from "../../design/layout";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Card, Divider, EmptyState, KeyValue, Pill, ScreenHeader, Stat, Txt } from "../../design/ui";
import { frDate } from "../../design/format";
import { fr } from "../../i18n/fr";
import { fcfa, logChart, m3, MEMBERSHIP_TONE } from "./aggregate";

const t = fr.coop;
const DOC_ORDER = ["valide", "soumis", "manquant", "expire", "rejete"] as const;
const TAX_ORDER = ["du", "en_retard", "paye"] as const;

/** Read-only view of one member for its cooperative: the records stay the member's own. */
export default function CoopMemberDetail({ membershipId, onBack }: { membershipId: number; onBack: () => void }) {
  const theme = useTheme();
  const s = useStyles();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await getCoopMember(membershipId));
    } catch {
      setError(true);
    }
  }, [membershipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const m = data?.membership;
  const header = (
    <ScreenHeader
      eyebrow={m ? `${fr.org.type[m.member_org_type] ?? m.member_org_type}${m.member_profile_label ? ` · ${m.member_profile_label}` : ""}` : t.tabs.members}
      title={m?.member_name ?? t.tabs.members}
      onBack={onBack}
      backLabel={fr.history.back}
    />
  );
  if (!data || !m) {
    return (
      <View style={s.screen}>
        {header}
        {error ? (
          <EmptyState message={fr.cooperative.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
        ) : (
          <ActivityIndicator style={s.loader} color={theme.c.olive} />
        )}
      </View>
    );
  }

  const agg = data.aggregate;
  const v = agg.volumes;
  return (
    <View style={s.screen} testID="coop-member-detail">
      {header}
      <ScrollView contentContainerStyle={s.content}>
        <Card style={s.banner} testID="coop-member-banner">
          <View style={s.row}>
            <Info size={16} color={theme.c.info} />
            <Txt variant="small" style={s.flex}>
              {data.members_note}
            </Txt>
          </View>
          <Txt variant="caption" tone="muted">
            {t.readOnly}
          </Txt>
        </Card>

        <View style={s.row}>
          <Pill tone={MEMBERSHIP_TONE[m.status]} label={t.status[m.status] ?? m.status} />
          <Txt variant="caption" tone="muted" style={s.flex}>
            {[t.joinedOn(frDate(m.joined_on)), m.left_on ? t.leftOn(frDate(m.left_on)) : null, t.provinces(m.member_provinces)]
              .filter(Boolean)
              .join(" · ")}
          </Txt>
        </View>

        <Card>
          <View style={s.stats}>
            <Stat compact value={m3(v.declared_m3)} unit={t.m3} label={t.declared} />
            <Stat compact value={m3(v.authorized_m3)} unit={t.m3} label={t.authorized} />
            <Stat compact value={m3(v.felled_m3)} unit={t.m3} label={`${t.felled} · ${t.stems(v.felled_stems)}`} tone="olive" />
          </View>
        </Card>

        <CardGrid minColumnWidth={360} maxColumns={2}>
          <Card testID="coop-member-titles">
            <Txt variant="label" tone="muted">
              {t.detailTitles}
            </Txt>
            {data.titles.length === 0 ? <Txt tone="muted">{t.detailNoTitles}</Txt> : null}
            {data.titles.map((ti, i) => (
              <View key={ti.id}>
                {i > 0 ? <Divider /> : null}
                <View style={s.line}>
                  <View style={s.flex}>
                    <Txt variant="small" bold>
                      {`${ti.title_type} · ${ti.reference ?? `n° ${ti.id}`}`}
                    </Txt>
                    <Txt variant="caption" tone="muted">
                      {[ti.province_name, ti.surface_ha ? fr.ministry.surface(ti.surface_ha) : null].filter(Boolean).join(" · ") || "—"}
                    </Txt>
                  </View>
                  <Pill tone={ti.status === "actif" ? "ok" : "neutral"} label={fr.titles.status[ti.status] ?? ti.status} />
                </View>
                {data.aacs
                  .filter((a) => a.title_ref === ti.reference)
                  .map((a) => (
                    <KeyValue
                      key={a.id}
                      label={`${t.aac} ${a.label}${a.campaign_year ? ` · ${a.campaign_year}` : ""}`}
                      value={fr.ministry.dash.aacStatus[a.status] ?? a.status}
                    />
                  ))}
              </View>
            ))}
          </Card>

          <Card testID="coop-member-species">
            <Txt variant="label" tone="muted">
              {t.bySpecies}
            </Txt>
            {data.felled_by_species.length === 0 ? <Txt tone="muted">{t.bySpeciesEmpty}</Txt> : null}
            {data.felled_by_species.map((sp) => (
              <KeyValue key={sp.species} label={`${sp.species} · ${t.stems(sp.stems)}`} value={`${m3(sp.volume_m3)} ${t.m3}`} />
            ))}
          </Card>

          <Card testID="coop-member-logs">
            <Txt variant="label" tone="muted">
              {t.detailLogs}
            </Txt>
            {agg.logs.total === 0 ? <Txt tone="muted">{t.logsEmpty}</Txt> : <ColumnChart data={logChart(agg)} height={140} />}
          </Card>

          <Card testID="coop-member-docs">
            <Txt variant="label" tone="muted">
              {t.detailDocs}
            </Txt>
            {DOC_ORDER.filter((k) => (agg.documents.by_status[k] ?? 0) > 0).map((k) => (
              <KeyValue key={k} label={fr.docs.status[k] ?? k} value={String(agg.documents.by_status[k])} />
            ))}
            {agg.documents.total === 0 ? <Txt tone="muted">—</Txt> : null}
          </Card>

          <Card testID="coop-member-taxes">
            <Txt variant="label" tone="muted">
              {t.detailTaxes}
            </Txt>
            {TAX_ORDER.every((k) => !(agg.taxes.by_status[k] ?? 0)) ? <Txt tone="muted">{t.noTaxes}</Txt> : null}
            {TAX_ORDER.filter((k) => (agg.taxes.by_status[k] ?? 0) > 0).map((k) => (
              <KeyValue
                key={k}
                label={`${fr.taxes.status[k] ?? k} · ${agg.taxes.by_status[k]}`}
                value={t.amount(fcfa(agg.taxes.amount_fcfa[k] ?? 0))}
              />
            ))}
          </Card>
        </CardGrid>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  loader: { flex: 1 },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  banner: { gap: th.space.xs, backgroundColor: th.c.infoSoft, borderColor: "transparent" },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.xs },
  flex: { flex: 1 },
  stats: { flexDirection: "row", gap: th.space.md },
}));
