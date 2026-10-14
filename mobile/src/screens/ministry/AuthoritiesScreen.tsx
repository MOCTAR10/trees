import { Compass } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";

import { AuthorityEntry, getAuthorityCompass } from "../../api/client";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Bullet, Card, EmptyState, Pill, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";

const t = fr.authorities;

/** Pilot compass: every competent authority, what the Ministry does for it today. */
export default function AuthoritiesScreen() {
  const theme = useTheme();
  const s = useStyles();
  const [rows, setRows] = useState<AuthorityEntry[]>([]);
  const [acting, setActing] = useState("Ministère des Eaux et Forêts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getAuthorityCompass();
      setRows(data.authorities);
      setActing(data.acting_authority);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading && rows.length > 0} onRefresh={() => void load()} />}
      testID="authorities-screen"
    >
      <View style={s.intro}>
        <Compass size={20} color={theme.c.goldInk} />
        <Txt variant="small" style={s.flex}>
          {t.intro(acting)}
        </Txt>
      </View>
      {loading && rows.length === 0 ? <ActivityIndicator color={theme.c.olive} /> : null}
      {error ? (
        <EmptyState message={fr.admin.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
      ) : null}
      {rows.map((a) => (
        <Card key={a.code} testID={`authority-${a.code}`}>
          <View style={s.row}>
            <Txt variant="heading" style={s.code}>
              {a.code}
            </Txt>
            <Pill tone={a.pending ? "warn" : "neutral"} label={t.pending(a.pending)} />
          </View>
          <Txt variant="small" bold>
            {a.name}
          </Txt>
          <Txt variant="caption" tone="muted">
            {a.mission}
          </Txt>
          <Txt variant="label" tone="muted" style={s.section}>
            {t.actions}
          </Txt>
          {a.actions.map((x) => (
            <Bullet key={x}>{x}</Bullet>
          ))}
          {a.controls.length ? (
            <Txt variant="caption" tone="muted">
              {`${t.controls} : ${a.controls.map((c) => fr.ministry.controlTypes[c as keyof typeof fr.ministry.controlTypes] ?? c).join(", ")}`}
            </Txt>
          ) : null}
          <View style={s.footer}>
            <Pill tone="gold" label={t.future} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
  intro: {
    flexDirection: "row",
    gap: th.space.sm,
    alignItems: "flex-start",
    backgroundColor: th.c.goldSoft,
    borderColor: th.c.gold,
    borderWidth: 1,
    borderRadius: th.radius.md,
    padding: th.space.md,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: th.space.sm },
  code: { letterSpacing: 0.5 },
  section: { marginTop: th.space.xs },
  footer: { flexDirection: "row", marginTop: th.space.xs },
}));
