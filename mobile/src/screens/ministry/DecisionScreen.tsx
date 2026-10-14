import { Check, CircleAlert, Landmark, X } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";

import { CheckLevel, decideInbox, getInboxDetail, InboxDetail, InboxQueueKey } from "../../api/client";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Button, Card, Divider, EmptyState, KeyValue, Pill, ScreenHeader, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";
import { daysSince } from "./shared";

const t = fr.ministry;

interface Props {
  type: InboxQueueKey;
  id: number;
  onBack: () => void;
  onDecided: () => void;
  now?: Date;
}

export function CheckRow({ level, label }: { level: CheckLevel; label: string }) {
  const theme = useTheme();
  const s = useStyles();
  const color = level === "ok" ? theme.c.ok : level === "ko" ? theme.c.risk : theme.c.warn;
  const Icon = level === "ok" ? Check : level === "ko" ? X : CircleAlert;
  return (
    <View style={s.check} testID={`check-${level}`}>
      <View style={[s.checkIcon, { backgroundColor: color }]}>
        <Icon size={12} color="#FFFFFF" strokeWidth={3} />
      </View>
      <Txt variant="small" style={s.flex}>
        {label}
      </Txt>
    </View>
  );
}

/** One file, every queue: facts, automatic checks, items, then the decision. */
export default function DecisionScreen({ type, id, onBack, onDecided, now }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [data, setData] = useState<InboxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [motif, setMotif] = useState("");
  const [motifError, setMotifError] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getInboxDetail(type, id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [type, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (approve: boolean) => {
    if (!approve && !motif.trim()) {
      setMotifError(true);
      return;
    }
    setBusy(approve ? "approve" : "reject");
    setDecideError(null);
    try {
      await decideInbox(type, id, approve, motif.trim() || null);
      onDecided();
    } catch (err) {
      setDecideError(err instanceof Error && err.message ? err.message : t.decideError);
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <ScreenHeader
      eyebrow={t.decisionEyebrow(t.types[type] ?? type)}
      title={data?.label ?? t.types[type] ?? type}
      onBack={onBack}
      backLabel={fr.history.back}
    />
  );

  if (!data) {
    return (
      <View style={s.screen}>
        {header}
        {loading ? (
          <ActivityIndicator style={s.loader} color={theme.c.olive} />
        ) : error ? (
          <EmptyState message={fr.admin.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
        ) : null}
      </View>
    );
  }

  const days = daysSince(data.created_at, now);
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="decision-screen">
      {header}
      <ScrollView contentContainerStyle={s.content}>
        {data.competence_note ? (
          <View style={s.banner} testID="decision-competence">
            <Landmark size={18} color={theme.c.goldInk} />
            <View style={s.flex}>
              <Txt variant="small" bold>
                {fr.authorities.banner}
              </Txt>
              <Txt variant="caption" tone="muted">
                {data.competence_note}
              </Txt>
            </View>
          </View>
        ) : null}
        <Card raised>
          <Txt variant="label" tone="gold">
            {t.factsTitle}
          </Txt>
          {data.org_name ? <KeyValue label={t.organisation} value={data.org_name} /> : null}
          {data.province_name ? <KeyValue label={t.province} value={data.province_name} /> : null}
          <KeyValue label={t.authority} value={data.authority} />
          {days != null ? <KeyValue label={t.submitted} value={t.age(days)} /> : null}
          {data.facts.map((f) => (
            <KeyValue key={f.label} label={f.label} value={f.value} />
          ))}
        </Card>

        <Card testID="decision-checks">
          <Txt variant="label" tone="muted">
            {t.checksTitle}
          </Txt>
          {data.checks.map((c, i) => (
            <CheckRow key={`${c.label}-${i}`} level={c.level} label={c.label} />
          ))}
        </Card>

        {data.items.length ? (
          <Card>
            <Txt variant="label" tone="muted">
              {t.itemsTitle(data.items.length)}
            </Txt>
            {data.items.map((it, i) => (
              <View key={`${it.label}-${i}`}>
                {i > 0 ? <Divider /> : null}
                <View style={s.item}>
                  <View style={s.flex}>
                    <Txt variant="small" bold>
                      {it.label}
                    </Txt>
                    {it.detail ? (
                      <Txt variant="caption" tone="muted">
                        {it.detail}
                      </Txt>
                    ) : null}
                  </View>
                  {it.flags.length ? (
                    <Pill tone="warn" label={it.flags.map((f) => fr.felling.violation[f as keyof typeof fr.felling.violation] ?? f).join(" · ")} />
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <View style={s.bar}>
        {data.blocking ? (
          <Txt variant="caption" tone="risk" testID="decision-blocking">
            {t.blockingNote}
          </Txt>
        ) : null}
        <TextInput
          testID="decision-motif"
          style={[s.input, motifError && s.inputError]}
          value={motif}
          onChangeText={(v) => {
            setMotif(v);
            setMotifError(false);
          }}
          placeholder={t.motifPlaceholder}
          placeholderTextColor={theme.c.muted}
          multiline
        />
        {motifError ? (
          <Txt variant="caption" tone="risk">
            {t.motifRequired}
          </Txt>
        ) : null}
        {decideError ? (
          <Txt variant="caption" tone="risk" testID="decision-error">
            {decideError}
          </Txt>
        ) : null}
        <View style={s.actions}>
          <Button
            testID="decision-reject"
            label={t.reject}
            variant="secondary"
            loading={busy === "reject"}
            disabled={busy != null}
            onPress={() => void decide(false)}
            style={s.flex}
          />
          <Button
            testID="decision-approve"
            label={data.approve_label}
            loading={busy === "approve"}
            disabled={busy != null}
            onPress={() => void decide(true)}
            style={s.flex}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  loader: { flex: 1 },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xl },
  flex: { flex: 1 },
  check: { flexDirection: "row", alignItems: "flex-start", gap: th.space.sm, paddingVertical: 3 },
  banner: {
    flexDirection: "row",
    gap: th.space.sm,
    alignItems: "flex-start",
    backgroundColor: th.c.goldSoft,
    borderColor: th.c.gold,
    borderWidth: 1,
    borderRadius: th.radius.md,
    padding: th.space.md,
  },
  checkIcon: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.sm },
  bar: {
    backgroundColor: th.c.surface,
    borderTopWidth: 1,
    borderTopColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.sm,
  },
  input: {
    minHeight: 48,
    maxHeight: 110,
    borderRadius: th.radius.md,
    borderWidth: 1.5,
    borderColor: th.c.line,
    backgroundColor: th.c.surface2,
    color: th.c.ink,
    fontFamily: th.fonts.body,
    fontSize: 15,
    paddingHorizontal: th.space.md,
    paddingVertical: th.space.sm,
    textAlignVertical: "top",
  },
  inputError: { borderColor: th.c.risk },
  actions: { flexDirection: "row", gap: th.space.sm },
}));
