import { UserPlus } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, TextInput, View } from "react-native";

import { CompanyAgent, createMyAgent, listMyAgents, setMyAgentActive } from "../api/client";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { frDate } from "../design/format";
import { Button, Card, Divider, EmptyState, Pill, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.agents;
const EMPTY = { first_name: "", last_name: "", email: "", password: "", matricule: "" };

/** The company opens and suspends its own field agent accounts. */
export default function CompanyAgents() {
  const theme = useTheme();
  const s = useStyles();
  const [agents, setAgents] = useState<CompanyAgent[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "risk"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setAgents(await listMyAgents());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!form) return;
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setNotice({ tone: "risk", text: t.required });
      return;
    }
    if (form.password.length < 8) {
      setNotice({ tone: "risk", text: t.passwordShort });
      return;
    }
    setBusy("new");
    setNotice(null);
    try {
      const agent = await createMyAgent({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        password: form.password,
        matricule: form.matricule.trim() || null,
      });
      setForm(null);
      setNotice({ tone: "ok", text: t.created(agent.display_name, agent.email) });
      await load();
    } catch (err) {
      setNotice({ tone: "risk", text: err instanceof Error && err.message ? err.message : t.error });
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (agent: CompanyAgent) => {
    setBusy(agent.id);
    setNotice(null);
    try {
      await setMyAgentActive(agent.id, !agent.is_active);
      await load();
    } catch (err) {
      setNotice({ tone: "risk", text: err instanceof Error && err.message ? err.message : t.error });
    } finally {
      setBusy(null);
    }
  };

  const field = (key: keyof typeof EMPTY, label: string, extra: object = {}) => (
    <TextInput
      testID={`agent-${key}`}
      style={s.input}
      value={form?.[key] ?? ""}
      onChangeText={(v) => setForm((f) => (f ? { ...f, [key]: v } : f))}
      placeholder={label}
      placeholderTextColor={theme.c.muted}
      autoCapitalize="none"
      {...extra}
    />
  );

  if (!agents) {
    return (
      <View style={s.screen}>
        {loading ? (
          <ActivityIndicator style={s.flex} color={theme.c.olive} />
        ) : error ? (
          <EmptyState message={t.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      testID="company-agents"
    >
      <Txt variant="title">{t.title}</Txt>
      <Txt variant="small" tone="muted">
        {t.hint}
      </Txt>
      {notice ? (
        <Txt variant="small" tone={notice.tone} testID="agents-notice">
          {notice.text}
        </Txt>
      ) : null}

      {form ? (
        <Card raised testID="agent-form">
          <Txt variant="heading">{t.newAgent}</Txt>
          {field("first_name", t.firstName, { autoCapitalize: "words" })}
          {field("last_name", t.lastName, { autoCapitalize: "words" })}
          {field("email", t.email, { keyboardType: "email-address" })}
          {field("password", t.password, { secureTextEntry: true })}
          {field("matricule", t.matricule, { autoCapitalize: "characters" })}
          <View style={s.row}>
            <Button label={fr.common.cancel} variant="ghost" compact onPress={() => setForm(null)} />
            <Button testID="agent-create" label={t.create} compact loading={busy === "new"} onPress={() => void create()} />
          </View>
        </Card>
      ) : (
        <Button
          testID="agent-add"
          label={t.newAgent}
          icon={<UserPlus size={16} color={theme.c.onOlive} />}
          onPress={() => {
            setForm({ ...EMPTY });
            setNotice(null);
          }}
        />
      )}

      <Card testID="agents-list">
        {agents.length === 0 ? (
          <Txt variant="small" tone="muted">
            {t.empty}
          </Txt>
        ) : (
          agents.map((a, i) => (
            <View key={a.id} testID={`agent-row-${a.id}`}>
              {i > 0 ? <Divider /> : null}
              <View style={s.agent}>
                <View style={s.flex}>
                  <Txt variant="small" bold>
                    {a.display_name}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {[a.matricule, a.email].filter(Boolean).join(" · ")}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {a.last_scan_at ? t.lastScan(frDate(a.last_scan_at)) : t.noScan}
                  </Txt>
                </View>
                <View style={s.side}>
                  <Pill tone={a.is_active ? "ok" : "neutral"} label={a.is_active ? t.active : t.suspended} />
                  <Button
                    testID={`agent-toggle-${a.id}`}
                    label={a.is_active ? t.suspend : t.reactivate}
                    variant={a.is_active ? "ghost" : "secondary"}
                    compact
                    loading={busy === a.id}
                    onPress={() => void toggle(a)}
                  />
                </View>
              </View>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: th.space.sm },
  agent: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.sm },
  side: { alignItems: "flex-end", gap: th.space.xs },
  input: {
    minHeight: 48,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface2,
    color: th.c.ink,
    fontFamily: th.fonts.body,
    fontSize: 15,
    paddingHorizontal: th.space.md,
  },
}));
