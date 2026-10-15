import React, { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { addControlFollowup, ControlFollowup, FollowupType, setFollowupStatus } from "../../api/client";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { frDate } from "../../design/format";
import { Button, Pill, PillTone, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";

const t = fr.followups;
const TYPES: FollowupType[] = ["mise_en_demeure", "amende", "transaction", "saisie", "suspension", "poursuite"];
const WITH_AMOUNT: FollowupType[] = ["amende", "transaction"];
const TONE: Record<string, PillTone> = { notifie: "warn", en_retard: "risk", conteste: "info", execute: "ok", annule: "neutral" };

interface Props {
  controlId: number;
  followups: ControlFollowup[];
  onChanged: () => void;
}

/** Follow-ups of a non-compliant control: notify, then mark executed or cancel. */
export default function ControlFollowups({ controlId, followups, onChanged }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<FollowupType>("mise_en_demeure");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setAdding(false);
      setCancelling(null);
      setMotif("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(() =>
      addControlFollowup(controlId, {
        action_type: type,
        amount_fcfa: WITH_AMOUNT.includes(type) ? Number(amount.replace(/\s/g, "").replace(",", ".")) || null : null,
        due_at: due.trim() || null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      }),
    );

  return (
    <View style={s.box} testID={`followups-${controlId}`}>
      <Txt variant="label" tone="muted">
        {t.title}
      </Txt>
      {followups.length === 0 ? (
        <Txt variant="caption" tone="muted">
          {t.empty}
        </Txt>
      ) : null}
      {followups.map((f) => (
        <View key={f.id} style={s.item} testID={`followup-${f.id}`}>
          <View style={s.row}>
            <Txt variant="small" bold style={s.flex}>
              {[
                f.label,
                f.amount_fcfa ? `${Math.round(f.amount_fcfa).toLocaleString("fr-FR")} FCFA` : null,
                f.due_at ? t.dueOn(frDate(f.due_at)) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Txt>
            <Pill tone={TONE[f.display_status] ?? "neutral"} label={f.status_label} />
          </View>
          {f.reply ? <Txt variant="caption" tone="info">{t.contested(f.reply)}</Txt> : null}
          {f.decision_motif ? <Txt variant="caption" tone="muted">{t.maintained(f.decision_motif)}</Txt> : null}
          {f.status === "notifie" ? (
            cancelling === f.id ? (
              <View style={s.form}>
                <TextInput
                  testID={`followup-motif-${f.id}`}
                  style={s.input}
                  value={motif}
                  onChangeText={setMotif}
                  placeholder={t.cancelMotif}
                  placeholderTextColor={theme.c.muted}
                />
                <View style={s.actions}>
                  <Button label={fr.common.cancel} variant="ghost" compact onPress={() => setCancelling(null)} />
                  <Button
                    testID={`followup-cancel-confirm-${f.id}`}
                    label={t.cancel}
                    variant="danger"
                    compact
                    loading={busy}
                    onPress={() => void run(() => setFollowupStatus(f.id, "annule", motif))}
                  />
                </View>
              </View>
            ) : (
              <View style={s.actions}>
                <Button testID={`followup-cancel-${f.id}`} label={t.cancel} variant="ghost" compact onPress={() => setCancelling(f.id)} />
                <Button
                  testID={`followup-execute-${f.id}`}
                  label={t.execute}
                  compact
                  loading={busy}
                  onPress={() => void run(() => setFollowupStatus(f.id, "execute"))}
                />
              </View>
            )
          ) : null}
        </View>
      ))}
      {adding ? (
        <View style={s.form} testID={`followup-form-${controlId}`}>
          <View style={s.chips}>
            {TYPES.map((k) => (
              <Pressable
                key={k}
                testID={`followup-type-${k}`}
                onPress={() => setType(k)}
                style={[s.chip, type === k && s.chipOn]}
              >
                <Txt variant="caption" tone={type === k ? "onOlive" : "muted"}>
                  {t.types[k]}
                </Txt>
              </Pressable>
            ))}
          </View>
          {WITH_AMOUNT.includes(type) ? (
            <TextInput
              testID="followup-amount"
              style={s.input}
              value={amount}
              onChangeText={setAmount}
              placeholder={t.amount}
              placeholderTextColor={theme.c.muted}
              keyboardType="numeric"
            />
          ) : null}
          <TextInput
            testID="followup-due"
            style={s.input}
            value={due}
            onChangeText={setDue}
            placeholder={t.due}
            placeholderTextColor={theme.c.muted}
          />
          <TextInput
            style={s.input}
            value={reference}
            onChangeText={setReference}
            placeholder={t.reference}
            placeholderTextColor={theme.c.muted}
          />
          <TextInput
            style={s.input}
            value={notes}
            onChangeText={setNotes}
            placeholder={t.notes}
            placeholderTextColor={theme.c.muted}
          />
          <Txt variant="caption" tone="muted">
            {t.hint}
          </Txt>
          <View style={s.actions}>
            <Button label={fr.common.cancel} variant="ghost" compact onPress={() => setAdding(false)} />
            <Button testID={`followup-save-${controlId}`} label={t.save} compact loading={busy} onPress={() => void save()} />
          </View>
        </View>
      ) : (
        <Button testID={`followup-add-${controlId}`} label={t.add} variant="secondary" compact onPress={() => setAdding(true)} />
      )}
      {error ? (
        <Txt variant="caption" tone="risk">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  box: { gap: th.space.xs, borderTopWidth: 1, borderTopColor: th.c.line, paddingTop: th.space.sm },
  item: { gap: 4, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  flex: { flex: 1 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: th.space.sm },
  form: { gap: th.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
  chip: {
    borderRadius: th.radius.pill,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.md,
    paddingVertical: 6,
    backgroundColor: th.c.surface2,
  },
  chipOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  input: {
    minHeight: 44,
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
