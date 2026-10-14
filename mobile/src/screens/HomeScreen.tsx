import { ChevronRight, CloudUpload, Mail, ScanLine, Truck, Users } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { HomePeriod, HomeProject, HomeSummary } from "../api/client";
import { VERDICT_TONE } from "../components/ForestChecksCard";
import { dec } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, Divider, Pill, Txt } from "../design/ui";
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
  /** First name and matricule known from the session (used offline). */
  firstName?: string | null;
  matricule?: string | null;
  onOpenScan?: (scan: StoredScan) => void;
  now?: Date;
  summary?: HomeSummary | null;
  busyProjectId?: number | null;
  onScanForProject?: (project: HomeProject) => void;
  onJoinProject?: (id: number) => void;
  onAcceptInvitation?: (id: number) => void;
  onDeclineInvitation?: (id: number) => void;
  onOpenProjects?: () => void;
  onOpenCustody?: () => void;
  onOpenProfile?: () => void;
  /** Open a chantier screen (or a project page) from its row. */
  onOpenProject?: (project: HomeProject) => void;
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

const PERIODS: HomePeriod[] = ["today", "week", "month", "all"];
type ScanKind = "all" | "free" | "project";
const KINDS: ScanKind[] = ["all", "free", "project"];

/** Whether a scan date falls in the period (local day for "today"). */
export function inPeriod(iso: string, period: HomePeriod, ref: Date): boolean {
  const when = new Date(iso);
  if (period === "all") return true;
  if (period === "today") return sameDay(when, ref);
  const days = period === "week" ? 7 : 30;
  return ref.getTime() - when.getTime() <= days * 86400000;
}

function Chips<K extends string>({
  options,
  value,
  onChange,
  label,
  testPrefix,
}: {
  options: K[];
  value: K;
  onChange: (k: K) => void;
  label: (k: K) => string;
  testPrefix: string;
}) {
  const s = useStyles();
  return (
    <View style={s.chips}>
      {options.map((k) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            testID={`${testPrefix}-${k}`}
            onPress={() => onChange(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[s.chip, on && s.chipOn]}
            hitSlop={4}
          >
            <Txt variant="caption" bold={on} tone={on ? "onOlive" : "muted"}>
              {label(k)}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function projectLine(p: HomeProject): string {
  if (p.kind === "chantier") {
    const parts = [
      p.aac_label,
      p.registry_trees ? t.chantierProgress(p.registry_scanned ?? 0, p.registry_trees) : null,
    ];
    return parts.filter(Boolean).join(" · ");
  }
  return t.projectProgress(p.my_scans ?? 0, p.scans, p.participants);
}

/** A figure of the top strip: value over a short label. */
function Tile({ value, unit, label, tone, testID }: { value: string; unit?: string; label: string; tone?: "ok"; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.tile} testID={testID}>
      <Txt variant="heading" numeric tone={tone ?? "ink"}>
        {value}
        {unit ? <Txt variant="caption" tone="muted">{` ${unit}`}</Txt> : null}
      </Txt>
      <Txt variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

export default function HomeScreen({
  scanCount,
  pendingCount,
  syncing,
  onNew,
  onHistory,
  onSync,
  scans = [],
  firstName,
  matricule,
  onOpenScan,
  now,
  summary,
  busyProjectId,
  onScanForProject,
  onJoinProject,
  onAcceptInvitation,
  onDeclineInvitation,
  onOpenProjects,
  onOpenCustody,
  onOpenProfile,
  onOpenProject,
}: Props) {
  const theme = useTheme();
  const s = useStyles();

  const [period, setPeriod] = useState<HomePeriod>("week");
  const [kind, setKind] = useState<ScanKind>("all");
  const inRange = useMemo(() => {
    const ref = now ?? new Date();
    return scans.filter((scan) => inPeriod(scan.created_at, period, ref));
  }, [scans, period, now]);
  const local = useMemo(() => {
    const species = new Set(inRange.map((scan) => scan.report.species_scientific_name).filter(Boolean));
    return {
      count: inRange.length,
      species: species.size,
      co2T: inRange.reduce((sum, scan) => sum + (scan.report.co2e_kg ?? 0), 0) / 1000,
      forProjects: inRange.filter((scan) => scan.report.project_id).length,
    };
  }, [inRange]);

  const person = summary?.person;
  const name = person?.first_name ?? firstName ?? null;
  const badge = person?.matricule ?? matricule ?? null;
  const server = summary?.scans.periods?.[period] ?? null;
  const figures = server
    ? { count: server.count, species: server.species, co2T: server.co2e_kg / 1000, forProjects: server.for_projects }
    : local;
  const recent = inRange
    .filter((scan) => kind === "all" || (kind === "project" ? !!scan.report.project_id : !scan.report.project_id))
    .slice(0, 5);
  const invitations = summary?.projects.invitations ?? [];
  const joined = summary?.projects.joined ?? [];
  const available = summary?.projects.available ?? [];
  const group = summary?.group ?? null;
  const groupPeriod = group ? (group.trees_by_period?.[period] ?? (period === "week" ? group.trees_week : 0)) : 0;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} testID="home-screen">
      <View style={s.greeting}>
        <Txt variant="label" tone="gold">
          {badge ? `${t.eyebrow} · ${badge}` : t.eyebrow}
        </Txt>
        <Txt variant="title" testID="home-greeting">
          {name ? t.greeting(name) : t.greetingNoName}
        </Txt>
        {!name ? (
          <Pressable onPress={onOpenProfile} accessibilityRole="button" testID="home-add-name" hitSlop={6}>
            <Txt variant="small" tone="olive" bold>
              {t.addName}
            </Txt>
          </Pressable>
        ) : group?.name ? (
          <Txt variant="small" tone="muted">
            {group.name}
          </Txt>
        ) : null}
      </View>

      <Chips
        options={PERIODS}
        value={period}
        onChange={setPeriod}
        label={(k) => t.periods[k]}
        testPrefix="home-period"
      />
      <View style={s.strip}>
        <Tile testID="home-count" value={String(figures.count)} label={t.scansShort(figures.count)} />
        <Tile testID="home-co2" value={num(figures.co2T)} unit="t" label={t.co2Short} tone="ok" />
        <Tile testID="home-species" value={String(figures.species)} label={t.species} />
        <Tile testID="home-for-projects" value={String(figures.forProjects)} label={t.forProjectsShort} />
      </View>
      {!summary ? (
        <Txt variant="caption" tone="muted" testID="home-offline-stats">
          {t.statsOffline}
        </Txt>
      ) : null}

      <Pressable
        testID="home-new-scan"
        onPress={onNew}
        accessibilityRole="button"
        accessibilityLabel={t.newScan}
        style={({ pressed }) => [s.scanRow, pressed && s.pressed]}
      >
        <View style={s.scanIcon}>
          <ScanLine size={20} color={theme.c.onOlive} strokeWidth={2.3} />
        </View>
        <View style={s.rowText}>
          <Txt bold>{t.newScan}</Txt>
          <Txt variant="caption" tone="muted">
            {t.freeScanLine}
          </Txt>
        </View>
        <ChevronRight size={18} color={theme.c.muted} />
      </Pressable>
      {onOpenCustody ? (
        <Pressable
          testID="home-custody"
          onPress={onOpenCustody}
          accessibilityRole="button"
          accessibilityLabel={fr.custody.title}
          style={({ pressed }) => [s.scanRow, pressed && s.pressed]}
        >
          <View style={[s.scanIcon, s.custodyIcon]}>
            <Truck size={18} color={theme.c.olive} strokeWidth={2.2} />
          </View>
          <View style={s.rowText}>
            <Txt bold>{fr.custody.title}</Txt>
            <Txt variant="caption" tone="muted">
              {fr.custody.homeLine}
            </Txt>
          </View>
          <ChevronRight size={18} color={theme.c.muted} />
        </Pressable>
      ) : null}
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

      {group ? (
        <Card style={s.compactCard} testID="home-group">
          <View style={s.groupHead}>
            <View style={s.groupIcon}>
              <Users size={18} color={theme.c.olive} strokeWidth={2.2} />
            </View>
            <View style={s.rowText}>
              <Txt variant="label" tone="muted">
                {group.type === "cooperative" ? t.groupCoop : t.groupCompany}
              </Txt>
              <Txt variant="heading" testID="home-group-name">
                {group.name ?? "—"}
              </Txt>
            </View>
          </View>
          <View style={s.groupStats}>
            <Tile testID="home-group-members" value={String(group.members)} label={t.members(group.members)} />
            <Tile testID="home-group-week" value={String(groupPeriod)} label={t.groupPeriod[period]} />
            <Tile testID="home-group-total" value={String(group.trees)} label={t.groupTotalShort} />
          </View>
          {server && groupPeriod > 0 ? (
            <>
              <View style={s.track}>
                <View style={[s.fillOlive, { width: `${Math.min(server.count / groupPeriod, 1) * 100}%` }]} />
              </View>
              <Txt variant="caption" tone="muted" testID="home-group-share">
                {t.myShare(server.count, groupPeriod, t.periods[period].toLowerCase())}
              </Txt>
            </>
          ) : null}
        </Card>
      ) : null}

      {invitations.map((p) => (
        <View key={`inv-${p.id}`} testID={`home-invitation-${p.id}`} style={s.invitation}>
          <Mail size={16} color={theme.c.goldInk} />
          <Pressable
            testID={`home-open-invitation-${p.id}`}
            onPress={() => onOpenProject?.(p)}
            accessibilityRole="button"
            accessibilityLabel={p.title}
            style={({ pressed }) => [s.rowText, pressed && s.pressed]}
          >
            <Txt variant="caption" tone="gold" bold>
              {p.kind === "chantier" ? t.invitationChantier : t.invitationProject}
            </Txt>
            <Txt variant="small" bold>
              {p.title}
            </Txt>
            {projectLine(p) ? (
              <Txt variant="caption" tone="muted">
                {projectLine(p)}
              </Txt>
            ) : null}
          </Pressable>
          <Pressable
            testID={`home-decline-${p.id}`}
            onPress={() => onDeclineInvitation?.(p.id)}
            disabled={busyProjectId === p.id}
            accessibilityRole="button"
            accessibilityLabel={t.decline}
            style={s.textBtn}
            hitSlop={4}
          >
            <Txt variant="small" tone="muted" bold>
              {t.decline}
            </Txt>
          </Pressable>
          <Button
            testID={`home-accept-${p.id}`}
            label={t.accept}
            compact
            loading={busyProjectId === p.id}
            onPress={() => onAcceptInvitation?.(p.id)}
          />
        </View>
      ))}

      <Card style={s.compactCard}>
        <View style={s.head}>
          <Txt variant="label" tone="muted">
            {t.myProjects}
          </Txt>
          {onOpenProjects ? (
            <Pressable onPress={onOpenProjects} accessibilityRole="button" hitSlop={8} style={s.seeAll}>
              <Txt variant="caption" tone="olive" bold>
                {t.allProjects}
              </Txt>
              <ChevronRight size={14} color={theme.c.olive} />
            </Pressable>
          ) : null}
        </View>
        {summary ? (
          <View style={s.groupStats} testID="home-project-counts">
            <Tile
              testID="home-count-chantiers"
              value={String(joined.filter((p) => p.kind === "chantier").length)}
              label={t.countChantiers}
            />
            <Tile
              testID="home-count-projects"
              value={String(joined.filter((p) => p.kind !== "chantier").length)}
              label={t.countProjects}
            />
            <Tile
              testID="home-count-available"
              value={String(summary.projects.available_count ?? available.length)}
              label={t.countAvailable}
            />
          </View>
        ) : null}
        {joined.length === 0 ? (
          <Txt variant="small" tone="muted">
            {summary ? t.noProjects : t.projectsOffline}
          </Txt>
        ) : (
          joined.map((p, i) => {
            const progress =
              p.kind === "chantier" && p.registry_trees ? (p.registry_scanned ?? 0) / p.registry_trees : null;
            return (
              <View key={p.id} testID={`home-project-${p.id}`}>
                {i > 0 ? <Divider /> : null}
                <View style={s.projectRow}>
                  <View style={[s.kindDot, p.kind === "chantier" ? s.kindChantier : s.kindOpen]} />
                  <Pressable
                    testID={`home-open-project-${p.id}`}
                    onPress={() => onOpenProject?.(p)}
                    accessibilityRole="button"
                    accessibilityLabel={p.title}
                    style={({ pressed }) => [s.rowText, pressed && s.pressed]}
                  >
                    <Txt variant="small" bold>
                      {p.title}
                    </Txt>
                    <Txt variant="caption" tone="muted">
                      {`${p.kind === "chantier" ? t.kindChantier : t.kindOpen}${projectLine(p) ? ` · ${projectLine(p)}` : ""}`}
                    </Txt>
                    {progress != null ? (
                      <View style={s.track}>
                        <View style={[s.fill, { width: `${Math.min(progress, 1) * 100}%` }]} />
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    testID={`home-scan-project-${p.id}`}
                    onPress={() => onScanForProject?.(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.scanForProject} : ${p.title}`}
                    style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
                  >
                    <ScanLine size={18} color={theme.c.onOlive} strokeWidth={2.3} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
        {available.length > 0 ? (
          <View testID="home-available" style={s.available}>
            <Txt variant="caption" tone="muted">
              {t.openProjects}
            </Txt>
            {available.map((p) => (
              <View key={p.id} style={s.projectRow}>
                <View style={[s.kindDot, s.kindOpen]} />
                <View style={s.rowText}>
                  <Txt variant="small" bold>
                    {p.title}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {t.participants(p.participants)}
                  </Txt>
                </View>
                <Pressable
                  testID={`home-join-${p.id}`}
                  onPress={() => onJoinProject?.(p.id)}
                  disabled={busyProjectId === p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.join} : ${p.title}`}
                  style={s.textBtn}
                  hitSlop={4}
                >
                  {busyProjectId === p.id ? (
                    <ActivityIndicator color={theme.c.olive} />
                  ) : (
                    <Txt variant="small" tone="olive" bold>
                      {t.join}
                    </Txt>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </Card>


      <Card style={s.compactCard}>
        <View style={s.head}>
          <Txt variant="label" tone="muted">
            {t.recentTitle}
          </Txt>
          {scanCount > 0 ? (
            <Pressable onPress={onHistory} accessibilityRole="button" hitSlop={8} style={s.seeAll}>
              <Txt variant="caption" tone="olive" bold>
                {t.seeAll}
              </Txt>
              <ChevronRight size={14} color={theme.c.olive} />
            </Pressable>
          ) : null}
        </View>
        <Chips options={KINDS} value={kind} onChange={setKind} label={(k) => t.kinds[k]} testPrefix="home-kind" />
        {recent.length === 0 ? (
          <Txt variant="small" tone="muted" testID="home-recent-empty">
            {scans.length === 0 ? t.emptyRecent : t.emptyFiltered}
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
                  style={({ pressed }) => [s.recentRow, pressed && s.pressed]}
                >
                  <View style={s.thumb}>
                    <Txt variant="caption" tone="olive" numeric>
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
                  {verdict ? (
                    <Pill tone={VERDICT_TONE[verdict] ?? "neutral"} label={t.verdictShort[verdict] ?? verdict} />
                  ) : null}
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
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  greeting: { gap: 2 },
  strip: {
    flexDirection: "row",
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingVertical: th.space.sm,
  },
  tile: { flex: 1, alignItems: "center", gap: 0, paddingHorizontal: 2 },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.md,
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.md,
    paddingVertical: th.space.sm,
    minHeight: 56,
  },
  custodyIcon: { backgroundColor: th.c.surface2, borderWidth: 1.5, borderColor: th.c.olive },
  scanIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: th.c.olive,
    borderWidth: 2,
    borderColor: th.c.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: th.space.sm,
    flexWrap: "wrap",
  },
  invitation: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    borderRadius: th.radius.lg,
    borderWidth: 1.5,
    borderColor: th.c.gold,
    backgroundColor: th.c.goldSoft,
    paddingHorizontal: th.space.md,
    paddingVertical: th.space.sm,
  },
  compactCard: { padding: th.space.md, gap: th.space.xs },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 28 },
  projectRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.sm },
  kindDot: { width: 8, height: 8, borderRadius: 4, alignSelf: "flex-start", marginTop: 6 },
  kindChantier: { backgroundColor: th.c.gold },
  kindOpen: { backgroundColor: th.c.info },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: th.c.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  textBtn: { minHeight: 40, minWidth: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: th.space.xs },
  available: { marginTop: th.space.xs, paddingTop: th.space.xs, borderTopWidth: 1, borderTopColor: th.c.line },
  track: { height: 4, borderRadius: 2, backgroundColor: th.c.surface2, overflow: "hidden", marginTop: 3 },
  fill: { height: 4, borderRadius: 2, backgroundColor: th.c.gold },
  groupHead: { flexDirection: "row", alignItems: "center", gap: th.space.md },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: th.c.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  groupStats: {
    flexDirection: "row",
    backgroundColor: th.c.surface2,
    borderRadius: th.radius.md,
    paddingVertical: th.space.sm,
    marginTop: th.space.xs,
  },
  fillOlive: { height: 4, borderRadius: 2, backgroundColor: th.c.olive },
  recentRow: { flexDirection: "row", alignItems: "center", gap: th.space.md, paddingVertical: th.space.xs + 2, minHeight: 48 },
  pressed: { opacity: 0.7 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
  chip: {
    minHeight: 32,
    paddingHorizontal: th.space.md,
    borderRadius: th.radius.pill,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  thumb: {
    width: 34,
    height: 34,
    borderRadius: th.radius.md,
    backgroundColor: th.c.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  sci: { fontStyle: "italic" },
}));
