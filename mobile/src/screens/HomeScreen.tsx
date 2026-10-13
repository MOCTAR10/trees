import { ChevronRight, CloudUpload, ScanLine } from "lucide-react-native";
import React, { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { VERDICT_TONE } from "../components/ForestChecksCard";
import { dec } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, Divider, Pill, SectionTitle, Stat, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import { StoredScan } from "../storage/history";

const t = fr.home;

interface Props {
  scanCount: number;
  pendingCount: number;
  syncing: boolean;
  onNew: () => void;
  onHistory: () => void;
  onSync: () => void;
  scans?: StoredScan[];
  userName?: string | null;
  onOpenScan?: (scan: StoredScan) => void;
  now?: Date;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? parts[0][1] ?? "")).toUpperCase();
}

const num = (v: number) => dec(v, 1);

export default function HomeScreen({
  scanCount,
  pendingCount,
  syncing,
  onNew,
  onHistory,
  onSync,
  scans = [],
  userName,
  onOpenScan,
  now,
}: Props) {
  const theme = useTheme();
  const s = useStyles();

  const today = useMemo(() => {
    const ref = now ?? new Date();
    const rows = scans.filter((scan) => sameDay(new Date(scan.created_at), ref));
    const co2Kg = rows.reduce((sum, scan) => sum + (scan.report.co2e_kg ?? 0), 0);
    return { trees: rows.length, co2T: co2Kg / 1000 };
  }, [scans, now]);

  const firstName = userName?.trim().split(/\s+/)[0];
  const recent = scans.slice(0, 3);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} testID="home-screen">
      <View style={s.greeting}>
        <Txt variant="label" tone="gold">
          {t.eyebrow}
        </Txt>
        <Txt variant="title">{firstName ? t.greeting(firstName) : t.greetingNoName}</Txt>
      </View>

      <Card raised>
        <SectionTitle title={t.measureTitle} />
        <Txt variant="small" tone="muted">
          {t.tagline}
        </Txt>
        <Button
          testID="home-new-scan"
          label={t.newScan}
          onPress={onNew}
          icon={<ScanLine size={20} color={theme.c.onOlive} strokeWidth={2.3} />}
          style={s.cta}
        />
        {pendingCount > 0 || syncing ? (
          <View style={s.syncRow}>
            <Pill tone="info" label={syncing ? t.syncing : t.pending(pendingCount)} testID="home-pending" />
            <Button
              testID="home-sync"
              label={t.syncNow}
              accessibilityLabel={t.syncQueue(pendingCount)}
              variant="secondary"
              compact
              loading={syncing}
              onPress={onSync}
              icon={<CloudUpload size={16} color={theme.c.olive} strokeWidth={2.2} />}
            />
          </View>
        ) : null}
      </Card>

      <Card>
        <Txt variant="label" tone="muted">
          {t.todayTitle}
        </Txt>
        <View style={s.stats}>
          <Stat testID="home-today-trees" value={String(today.trees)} label={t.todayTrees} compact />
          <Stat testID="home-today-co2" value={num(today.co2T)} unit="t" label={t.todayCo2} tone="ok" compact />
          <Stat value={String(scanCount)} label={t.totalScans} compact />
        </View>
      </Card>

      <Card>
        <View style={s.recentHead}>
          <Txt variant="heading">{t.recentTitle}</Txt>
          {scanCount > 0 ? (
            <Pressable onPress={onHistory} accessibilityRole="button" hitSlop={8} style={s.seeAll}>
              <Txt variant="small" tone="olive" bold>
                {t.seeAll}
              </Txt>
              <ChevronRight size={16} color={theme.c.olive} />
            </Pressable>
          ) : null}
        </View>
        {recent.length === 0 ? (
          <Txt variant="small" tone="muted">
            {t.emptyRecent}
          </Txt>
        ) : (
          recent.map((scan, i) => {
            const r = scan.report;
            const verdict = r.forest_checks?.verdict;
            const meta = [
              r.species_common_name_fr,
              r.measured_dbh_cm != null ? `${num(r.measured_dbh_cm)} cm` : null,
              r.tree_code,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <View key={scan.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  testID={`home-recent-${scan.id}`}
                  onPress={onOpenScan ? () => onOpenScan(scan) : onHistory}
                  accessibilityRole="button"
                  style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                >
                  <View style={s.thumb}>
                    <Txt variant="small" tone="olive" numeric>
                      {initials(r.species_common_name_fr ?? r.species_scientific_name)}
                    </Txt>
                  </View>
                  <View style={s.rowText}>
                    <Txt variant="small" bold numberOfLines={1} style={s.sci}>
                      {r.species_scientific_name ?? t.unknownSpecies}
                    </Txt>
                    {meta ? (
                      <Txt variant="caption" tone="muted" numberOfLines={1}>
                        {meta}
                      </Txt>
                    ) : null}
                  </View>
                  {verdict ? <Pill tone={VERDICT_TONE[verdict] ?? "neutral"} label={t.verdictShort[verdict] ?? verdict} /> : null}
                </Pressable>
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.lg, paddingBottom: th.space.xxl },
  greeting: { gap: 2 },
  cta: { marginTop: th.space.sm },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: th.space.sm,
    flexWrap: "wrap",
    marginTop: th.space.xs,
  },
  stats: { flexDirection: "row", gap: th.space.md },
  recentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.md, paddingVertical: th.space.sm, minHeight: 56 },
  rowPressed: { opacity: 0.7 },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: th.radius.md,
    backgroundColor: th.c.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0 },
  sci: { fontStyle: "italic" },
}));
