import { BarChart3, ChevronRight, TriangleAlert } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";

import {
  AdminInbox,
  dashboardOverview,
  DashboardOverview,
  getAdminInbox,
  getProvinces,
  InboxQueueKey,
  ProvinceSummary,
} from "../../api/client";
import { dec } from "../../design/format";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Card, Divider, EmptyState, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";
import DashboardPanels, { DashboardTiles, short } from "./DashboardPanels";
import { daysSince, DomainKey, QUEUE_DOMAIN } from "./shared";

const t = fr.ministry;

interface Props {
  firstName?: string | null;
  onOpenInbox: (type?: InboxQueueKey) => void;
  onOpenOrgs: (province?: string) => void;
  onOpenDomain: (key: DomainKey) => void;
  now?: Date;
}

function Kpi({ value, label, tone, testID }: { value: string; label: string; tone?: "ok" | "warn"; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.kpi} testID={testID}>
      <Txt variant="heading" numeric tone={tone ?? "ink"}>
        {value}
      </Txt>
      <Txt variant="caption" tone="muted" style={s.center}>
        {label}
      </Txt>
    </View>
  );
}

/** Ministry entry screen: what waits for a decision, alerts, key figures, provinces. */
export default function MinistryHomeScreen({ firstName, onOpenInbox, onOpenOrgs, onOpenDomain, now }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const [inbox, setInbox] = useState<AdminInbox | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [provinces, setProvinces] = useState<ProvinceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const [a, b, c] = await Promise.allSettled([getAdminInbox(), dashboardOverview(), getProvinces()]);
    if (a.status === "fulfilled") setInbox(a.value);
    if (b.status === "fulfilled") setOverview(b.value);
    if (c.status === "fulfilled") setProvinces(c.value);
    setError(a.status === "rejected" && b.status === "rejected");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const queues = (inbox?.queues ?? []).filter((q) => q.count > 0);
  const maxOrgs = Math.max(1, ...provinces.map((p) => p.organisations));
  const withOrgs = provinces.filter((p) => p.organisations > 0);

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading && !!inbox} onRefresh={() => void load()} />}
      testID="ministry-home"
    >
      <View style={s.greeting}>
        <Txt variant="label" tone="gold">
          {t.eyebrow}
        </Txt>
        <Txt variant="title" testID="ministry-greeting">
          {firstName ? t.greeting(firstName) : t.greetingNoName}
        </Txt>
      </View>

      {overview ? (
        <View style={s.strip} testID="ministry-kpis">
          <Kpi testID="kpi-volume" value={short(overview.harvest.estimated_volume_m3)} label={t.kpiVolume} />
          <Kpi testID="kpi-revenue" value={short(overview.taxes.receipts_amount_fcfa)} label={t.kpiRevenue} tone="ok" />
          <Kpi
            testID="kpi-overdue"
            value={String(overview.taxes.overdue)}
            label={t.kpiOverdue}
            tone={overview.taxes.overdue > 0 ? "warn" : undefined}
          />
          <Kpi testID="kpi-carbon" value={short((overview.carbon?.co2e_kg ?? 0) / 1000)} label={t.kpiCarbon} />
        </View>
      ) : null}

      {(inbox?.alerts ?? []).map((a) => (
        <Pressable
          key={a.kind}
          testID={`alert-${a.kind}`}
          onPress={() =>
            onOpenDomain(
              a.kind === "taxes_overdue"
                ? "fiscal"
                : a.kind === "documents_expired"
                  ? "documents"
                  : "anomalies",
            )
          }
          accessibilityRole="button"
          style={[s.alert, a.level === "risk" ? s.alertRisk : s.alertWarn]}
        >
          <TriangleAlert size={16} color={a.level === "risk" ? theme.c.risk : theme.c.warn} />
          <Txt variant="small" bold tone={a.level === "risk" ? "risk" : "warn"} style={s.flex}>
            {a.kind === "taxes_overdue"
              ? t.alerts.taxes_overdue(a.count, short(a.amount_fcfa ?? 0))
              : t.alerts[a.kind](a.count)}
          </Txt>
          <ChevronRight size={16} color={theme.c.muted} />
        </Pressable>
      ))}

      {overview ? <DashboardTiles overview={overview} /> : null}

      {loading && !inbox ? <ActivityIndicator color={theme.c.olive} /> : null}
      {error ? (
        <EmptyState message={fr.admin.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
      ) : null}

      <View style={wide ? s.twoCol : s.oneCol}>
      {inbox ? (
        <Card style={[s.compact, wide && s.col]}>
          <View style={s.head}>
            <Txt variant="label" tone="muted">
              {t.toProcess(inbox.total)}
            </Txt>
            <Pressable onPress={() => onOpenInbox()} accessibilityRole="button" hitSlop={8} style={s.link}>
              <Txt variant="caption" tone="olive" bold>
                {t.allTypes}
              </Txt>
              <ChevronRight size={14} color={theme.c.olive} />
            </Pressable>
          </View>
          {queues.length === 0 ? <Txt tone="muted">{t.nothingToDecide}</Txt> : null}
          {queues.map((q, i) => {
            const days = daysSince(q.oldest_at, now);
            return (
              <View key={q.key}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  testID={`queue-${q.key}`}
                  onPress={() =>
                    q.key === "anomalies" || q.key === "orphans" ? onOpenDomain(QUEUE_DOMAIN[q.key]) : onOpenInbox(q.key)
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [s.queue, pressed && s.pressed]}
                >
                  <Txt
                    variant="heading"
                    numeric
                    tone={days != null && days >= 7 ? "risk" : days != null && days >= 3 ? "warn" : "ink"}
                    style={s.count}
                  >
                    {String(q.count)}
                  </Txt>
                  <View style={s.flex}>
                    <Txt variant="small" bold>
                      {q.label}
                    </Txt>
                    <Txt variant="caption" tone="muted">
                      {[t.authorityLine(q.authority), days != null ? t.oldest(days) : null].filter(Boolean).join(" · ")}
                    </Txt>
                  </View>
                  <ChevronRight size={16} color={theme.c.muted} />
                </Pressable>
              </View>
            );
          })}
        </Card>
      ) : null}

      {provinces.length ? (
        <Card style={[s.compact, wide && s.col]} testID="ministry-provinces">
          <View style={s.head}>
            <Txt variant="label" tone="muted">
              {t.provincesTitle}
            </Txt>
            <Pressable onPress={() => onOpenOrgs()} accessibilityRole="button" hitSlop={8} style={s.link}>
              <Txt variant="caption" tone="olive" bold>
                {t.seeOrgs}
              </Txt>
              <ChevronRight size={14} color={theme.c.olive} />
            </Pressable>
          </View>
          {(withOrgs.length ? withOrgs : provinces.slice(0, 3)).map((p) => (
            <Pressable
              key={p.code}
              testID={`province-${p.code}`}
              onPress={() => onOpenOrgs(p.code)}
              accessibilityRole="button"
              style={s.bar}
            >
              <Txt variant="caption" style={s.barLabel} numberOfLines={1}>
                {p.name}
              </Txt>
              <View style={s.track}>
                <View style={[s.fill, { width: `${(p.organisations / maxOrgs) * 100}%` }]} />
              </View>
              <Txt variant="caption" bold numeric style={s.barValue}>
                {String(p.organisations)}
              </Txt>
            </Pressable>
          ))}
        </Card>
      ) : null}
      </View>

      {overview ? <DashboardPanels overview={overview} /> : null}

      <Pressable
        testID="ministry-stats"
        onPress={() => onOpenDomain("stats")}
        accessibilityRole="button"
        style={({ pressed }) => [s.statsRow, pressed && s.pressed]}
      >
        <View style={s.statsIcon}>
          <BarChart3 size={18} color={theme.c.onOlive} />
        </View>
        <View style={s.flex}>
          <Txt bold>{t.statsShortcut}</Txt>
          <Txt variant="caption" tone="muted">
            {t.statsHint}
          </Txt>
        </View>
        <ChevronRight size={18} color={theme.c.muted} />
      </Pressable>
    </ScrollView>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  greeting: { gap: 2 },
  flex: { flex: 1 },
  center: { textAlign: "center" },
  strip: {
    flexDirection: "row",
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingVertical: th.space.sm,
  },
  kpi: { flex: 1, alignItems: "center", paddingHorizontal: 2 },
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    borderRadius: th.radius.md,
    paddingHorizontal: th.space.md,
    paddingVertical: th.space.sm,
    minHeight: 44,
  },
  alertRisk: { backgroundColor: th.c.riskSoft },
  alertWarn: { backgroundColor: th.c.warnSoft },
  compact: { padding: th.space.md, gap: th.space.xs },
  twoCol: { flexDirection: "row", gap: th.space.md, alignItems: "flex-start" },
  oneCol: { gap: th.space.md },
  col: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 28 },
  queue: { flexDirection: "row", alignItems: "center", gap: th.space.md, paddingVertical: th.space.sm, minHeight: 52 },
  count: { minWidth: 34, textAlign: "center" },
  pressed: { opacity: 0.7 },
  bar: { flexDirection: "row", alignItems: "center", gap: th.space.sm, minHeight: 32 },
  barLabel: { width: 112 },
  barValue: { width: 26, textAlign: "right" },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: th.c.surface2, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: th.c.olive },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.md,
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.md,
  },
  statsIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: th.c.forest,
    alignItems: "center",
    justifyContent: "center",
  },
}));
