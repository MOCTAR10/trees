import { Trash2 } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, View } from "react-native";

import { GroupTree, listGroupTrees } from "../api/client";
import { VERDICT_TONE } from "../components/ForestChecksCard";
import { DEMO_SCANS, isDemoScan } from "../data/demoScans";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, EmptyState, Pill, Segmented, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import { StoredScan } from "../storage/history";

const t = fr.history;

type Scope = "mine" | "group";

interface Props {
  scans: StoredScan[];
  onOpen: (scan: StoredScan) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onBack?: () => void;
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? parts[0][1] ?? "")).toUpperCase();
}

export default function HistoryScreen({ scans: stored, onOpen, onDelete, onClear, onBack }: Props) {
  const demo = stored.length === 0;
  const scans = demo ? DEMO_SCANS : stored;
  const theme = useTheme();
  const s = useStyles();
  const [scope, setScope] = React.useState<Scope>("mine");
  const [group, setGroup] = React.useState<GroupTree[]>([]);
  const [groupLoading, setGroupLoading] = React.useState(false);
  const [groupError, setGroupError] = React.useState<string | null>(null);

  const loadGroup = React.useCallback(async () => {
    setGroupLoading(true);
    setGroupError(null);
    try {
      setGroup(await listGroupTrees(500));
    } catch (err) {
      console.error("group trees failed", err);
      setGroupError(fr.map.error);
    } finally {
      setGroupLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (scope === "group") loadGroup();
  }, [scope, loadGroup]);

  const confirmClear = () => {
    Alert.alert(t.clearConfirmTitle, t.clearConfirmMsg, [
      { text: t.cancel, style: "cancel" },
      { text: t.clear, style: "destructive", onPress: onClear },
    ]);
  };

  return (
    <View style={s.screen}>
      <View style={s.top}>
        {onBack ? <Button label={t.back} variant="ghost" compact onPress={onBack} /> : null}
        <Txt variant="title" style={s.title}>
          {t.title}
        </Txt>
        {scope === "mine" && !demo && scans.length > 0 ? (
          <Button label={t.clear} variant="ghost" compact onPress={confirmClear} />
        ) : null}
      </View>
      <View style={s.segment}>
        <Segmented
          options={[
            { key: "mine", label: t.mine },
            { key: "group", label: t.group },
          ]}
          value={scope}
          onChange={setScope}
        />
      </View>

      {scope === "mine" ? (
        scans.length === 0 ? (
          <EmptyState message={t.empty} />
        ) : (
          <FlatList
            data={scans}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.list}
            ListHeaderComponent={
              demo ? (
                <View style={s.demoBanner} testID="history-demo">
                  <Txt variant="small" bold tone="gold">
                    {t.demoTitle}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {t.demoNote}
                  </Txt>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const r = item.report;
              const species = r.species_common_name_fr ?? r.species_scientific_name ?? t.unknown;
              const verdict = r.forest_checks?.verdict;
              return (
                <View style={s.row}>
                  <Pressable
                    style={({ pressed }) => [s.rowMain, pressed && s.pressed]}
                    onPress={() => onOpen(item)}
                    accessibilityRole="button"
                    accessibilityLabel={species}
                  >
                    <View style={s.thumb}>
                      <Txt variant="small" tone="olive" numeric>
                        {initials(species)}
                      </Txt>
                    </View>
                    <View style={s.rowText}>
                      <Txt bold numberOfLines={1}>
                        {species}
                      </Txt>
                      <Txt variant="caption" tone="muted" numberOfLines={2}>
                        {`${t.dbh(r.measured_dbh_cm)} · ${when(item.created_at)} · ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
                      </Txt>
                      <View style={s.pills}>
                        {verdict ? (
                          <Pill tone={VERDICT_TONE[verdict] ?? "neutral"} label={fr.home.verdictShort[verdict] ?? verdict} />
                        ) : null}
                        {item.valorization ? <Pill tone="gold" label={t.planDone} /> : null}
                      </View>
                    </View>
                  </Pressable>
                  {isDemoScan(item.id) ? null : (
                  <Pressable
                    style={({ pressed }) => [s.delete, pressed && s.pressed]}
                    onPress={() => onDelete(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t.delete}
                    hitSlop={4}
                  >
                    <Trash2 size={18} color={theme.c.risk} />
                  </Pressable>
                  )}
                </View>
              );
            }}
          />
        )
      ) : groupLoading ? (
        <ActivityIndicator style={s.loader} color={theme.c.olive} />
      ) : groupError ? (
        <EmptyState message={groupError} tone="risk" action={{ label: fr.common.retry, onPress: loadGroup }} />
      ) : group.length === 0 ? (
        <EmptyState message={t.emptyGroup} />
      ) : (
        <FlatList
          data={group}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <View style={s.row}>
              <View style={s.rowMain}>
                <View style={s.thumb}>
                  <Txt variant="small" tone="olive" numeric>
                    {initials(item.owner_name)}
                  </Txt>
                </View>
                <View style={s.rowText}>
                  <Txt bold numberOfLines={1}>
                    {item.owner_name}
                  </Txt>
                  <Txt variant="caption" tone="muted" numberOfLines={2}>
                    {`${item.species_scientific_name ?? t.unknown} · ${t.dbh(item.measured_dbh_cm)} · ${when(item.created_at)}`}
                  </Txt>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    paddingHorizontal: th.space.lg,
    paddingTop: th.space.lg,
  },
  title: { flex: 1 },
  segment: { paddingHorizontal: th.space.lg, paddingVertical: th.space.md },
  loader: { flex: 1 },
  demoBanner: { gap: 2, padding: th.space.md, marginBottom: th.space.sm, borderRadius: th.radius.md, backgroundColor: th.c.goldSoft },
  list: { paddingHorizontal: th.space.lg, paddingBottom: th.space.xxl, gap: th.space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingLeft: th.space.md,
    paddingRight: th.space.xs,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: th.space.md, paddingVertical: th.space.md },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  pills: { flexDirection: "row", gap: th.space.xs, flexWrap: "wrap", marginTop: 2 },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: th.radius.md,
    backgroundColor: th.c.oliveSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  delete: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: th.radius.md },
  pressed: { opacity: 0.6 },
}));
