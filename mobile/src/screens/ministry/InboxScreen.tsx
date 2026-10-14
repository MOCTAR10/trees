import { ChevronRight } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { getInboxItems, getProvinces, InboxItem, InboxQueueKey, ProvinceSummary } from "../../api/client";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { EmptyState, Pill, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";
import { daysSince, DomainKey, QUEUE_DOMAIN } from "./shared";

const t = fr.ministry;

interface Props {
  initialType?: InboxQueueKey | null;
  onOpenDomain: (key: DomainKey) => void;
  now?: Date;
}

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  const s = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[s.chip, on && s.chipOn]}
      hitSlop={4}
    >
      <Txt variant="caption" bold={on} tone={on ? "onOlive" : "muted"}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Every file waiting for a Ministry decision, filterable by type and province. */
export default function InboxScreen({ initialType, onOpenDomain, now }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [provinces, setProvinces] = useState<ProvinceSummary[]>([]);
  const [type, setType] = useState<InboxQueueKey | null>(initialType ?? null);
  const [province, setProvince] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setType(initialType ?? null);
  }, [initialType]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [rows, provs] = await Promise.all([getInboxItems(), getProvinces().catch(() => [])]);
      setItems(rows);
      setProvinces(provs);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Partial<Record<InboxQueueKey, number>> = {};
    for (const i of items) c[i.type] = (c[i.type] ?? 0) + 1;
    return c;
  }, [items]);
  const types = (Object.keys(counts) as InboxQueueKey[]).sort();
  const usedProvinces = provinces.filter((p) => items.some((i) => i.province_code === p.code));
  const shown = items.filter((i) => (!type || i.type === type) && (!province || i.province_code === province));

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={() => void load()} />}
      testID="inbox-screen"
    >
      <Txt variant="title">{t.toProcess(items.length)}</Txt>
      <View style={s.chips}>
        <Chip testID="inbox-type-all" label={`${t.allTypes} ${items.length}`} on={!type} onPress={() => setType(null)} />
        {types.map((k) => (
          <Chip
            key={k}
            testID={`inbox-type-${k}`}
            label={`${t.types[k] ?? k} ${counts[k]}`}
            on={type === k}
            onPress={() => setType(k)}
          />
        ))}
      </View>
      {usedProvinces.length ? (
        <View style={s.chips}>
          <Chip testID="inbox-province-all" label={t.allProvinces} on={!province} onPress={() => setProvince(null)} />
          {usedProvinces.map((p) => (
            <Chip
              key={p.code}
              testID={`inbox-province-${p.code}`}
              label={p.name}
              on={province === p.code}
              onPress={() => setProvince(p.code)}
            />
          ))}
        </View>
      ) : null}

      {loading && items.length === 0 ? <ActivityIndicator color={theme.c.olive} /> : null}
      {error ? (
        <EmptyState message={fr.admin.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
      ) : !loading && shown.length === 0 ? (
        <Txt tone="muted" testID="inbox-empty">
          {items.length === 0 ? t.nothingToDecide : t.nothingPending}
        </Txt>
      ) : null}

      {shown.length ? (
        <View style={s.list}>
          {shown.map((i) => {
            const days = daysSince(i.created_at, now);
            return (
              <Pressable
                key={`${i.type}-${i.id}`}
                testID={`inbox-item-${i.type}-${i.id}`}
                onPress={() => onOpenDomain(QUEUE_DOMAIN[i.type])}
                accessibilityRole="button"
                style={({ pressed }) => [s.row, pressed && s.pressed]}
              >
                <View style={s.flex}>
                  <Txt variant="small" bold>
                    {i.label}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {[i.org_name, i.province_name, t.authorityLine(i.authority)].filter(Boolean).join(" · ")}
                  </Txt>
                </View>
                <View style={s.right}>
                  <Pill tone="neutral" label={t.types[i.type] ?? i.type} />
                  {days != null ? (
                    <Txt variant="caption" tone={days >= 7 ? "risk" : days >= 3 ? "warn" : "muted"} bold={days >= 3}>
                      {t.age(days)}
                    </Txt>
                  ) : null}
                </View>
                <ChevronRight size={16} color={theme.c.muted} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
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
  list: {
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    paddingVertical: th.space.md,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  right: { alignItems: "flex-end", gap: 4 },
  pressed: { opacity: 0.7 },
}));
