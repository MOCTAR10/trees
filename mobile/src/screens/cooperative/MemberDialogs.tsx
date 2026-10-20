import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";

import { CoopCandidate, CoopMembership, MemberChange, MemberInput } from "../../api/client";
import { useDialog } from "../../design/layout";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Button, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";

const t = fr.coop;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : t.saveError;
}

function Sheet({
  visible,
  title,
  onClose,
  onSubmit,
  submitLabel,
  busy,
  error,
  testID,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  testID: string;
  children: React.ReactNode;
}) {
  const dialog = useDialog();
  const s = useStyles();
  return (
    <Modal visible={visible} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[s.backdrop, dialog.backdrop]}>
        <View style={[s.sheet, dialog.sheet]} testID={testID}>
          <Txt variant="heading">{title}</Txt>
          <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
            {children}
            {error ? (
              <Txt variant="small" tone="risk" testID={`${testID}-error`}>
                {error}
              </Txt>
            ) : null}
          </ScrollView>
          <View style={s.actions}>
            <Button label={fr.common.cancel} variant="secondary" onPress={onClose} style={s.flex} disabled={busy} />
            <Button testID={`${testID}-submit`} label={submitLabel} loading={busy} onPress={onSubmit} style={s.flex} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Search an organisation (name, type, provinces only) and add it as a member. */
export function AddMemberDialog({
  visible,
  search,
  onAdd,
  onClose,
  onDone,
}: {
  visible: boolean;
  search: (q: string) => Promise<CoopCandidate[]>;
  onAdd: (input: MemberInput) => Promise<CoopMembership>;
  onClose: () => void;
  onDone: (added: CoopMembership) => void;
}) {
  const theme = useTheme();
  const s = useStyles();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CoopCandidate[]>([]);
  const [picked, setPicked] = useState<CoopCandidate | null>(null);
  const [joined, setJoined] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const run = async (query: string) => {
    const id = ++request.current;
    try {
      const rows = await search(query);
      if (id === request.current) setResults(rows);
    } catch {
      if (id === request.current) setResults([]);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setQ("");
    setPicked(null);
    setJoined("");
    setNotes("");
    setError(null);
    void run("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = async () => {
    if (!picked) {
      setError(t.chooseMember);
      return;
    }
    if (joined.trim() && !DATE_RE.test(joined.trim())) {
      setError(t.invalidDate);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const added = await onAdd({ member_org_id: picked.id, joined_on: joined.trim() || null, notes: notes.trim() || null });
      onDone(added);
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={t.addMember}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={t.add}
      busy={busy}
      error={error}
      testID="member-add"
    >
      <TextInput
        testID="member-add-search"
        style={s.input}
        value={q}
        onChangeText={(v) => {
          setQ(v);
          void run(v);
        }}
        placeholder={t.searchPlaceholder}
        placeholderTextColor={theme.c.muted}
      />
      <Txt variant="caption" tone="muted">
        {t.searchHint}
      </Txt>
      {results.length === 0 ? (
        <Txt variant="small" tone="muted">
          {t.noCandidates}
        </Txt>
      ) : (
        results.map((c) => {
          const on = picked?.id === c.id;
          return (
            <Pressable
              key={c.id}
              testID={`member-candidate-${c.id}`}
              onPress={() => setPicked(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[s.candidate, on && s.candidateOn]}
            >
              <Txt variant="small" bold>
                {c.name}
              </Txt>
              <Txt variant="caption" tone="muted">
                {`${fr.org.type[c.org_type] ?? c.org_type} · ${t.provinces(c.provinces)}`}
              </Txt>
            </Pressable>
          );
        })
      )}
      <TextInput
        testID="member-add-joined"
        style={s.input}
        value={joined}
        onChangeText={setJoined}
        placeholder={t.joinedField}
        placeholderTextColor={theme.c.muted}
        autoCapitalize="none"
      />
      <TextInput
        testID="member-add-notes"
        style={s.input}
        value={notes}
        onChangeText={setNotes}
        placeholder={t.notesField}
        placeholderTextColor={theme.c.muted}
      />
    </Sheet>
  );
}

export type StatusTarget = { membership: CoopMembership; status: "suspendue" | "sortie" };

/** Suspend a member or record its leaving: the reason is required. */
export function MemberStatusDialog({
  target,
  onSubmit,
  onClose,
  onDone,
}: {
  target: StatusTarget | null;
  onSubmit: (membership: CoopMembership, change: MemberChange) => Promise<CoopMembership>;
  onClose: () => void;
  onDone: () => void;
}) {
  const theme = useTheme();
  const s = useStyles();
  const [reason, setReason] = useState("");
  const [leftOn, setLeftOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setLeftOn("");
    setError(null);
  }, [target]);

  const submit = async () => {
    if (!target) return;
    if (!reason.trim()) {
      setError(t.reasonRequired);
      return;
    }
    if (leftOn.trim() && !DATE_RE.test(leftOn.trim())) {
      setError(t.invalidDate);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(target.membership, {
        status: target.status,
        reason: reason.trim(),
        left_on: target.status === "sortie" ? leftOn.trim() || null : null,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const name = target?.membership.member_name ?? "";
  return (
    <Sheet
      visible={!!target}
      title={target?.status === "sortie" ? t.leaveTitle(name) : t.suspendTitle(name)}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={t.confirm}
      busy={busy}
      error={error}
      testID="member-status"
    >
      <View style={s.chips}>
        {(target ? t.reasons[target.status] : []).map((r) => (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            accessibilityRole="button"
            accessibilityState={{ selected: reason === r }}
            style={[s.chip, reason === r && s.chipOn]}
          >
            <Txt variant="caption" bold={reason === r} tone={reason === r ? "onOlive" : "muted"}>
              {r}
            </Txt>
          </Pressable>
        ))}
      </View>
      <TextInput
        testID="member-status-reason"
        style={s.input}
        value={reason}
        onChangeText={setReason}
        placeholder={t.reasonField}
        placeholderTextColor={theme.c.muted}
        multiline
      />
      {target?.status === "sortie" ? (
        <TextInput
          testID="member-status-left"
          style={s.input}
          value={leftOn}
          onChangeText={setLeftOn}
          placeholder={t.leftField}
          placeholderTextColor={theme.c.muted}
          autoCapitalize="none"
        />
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles((th) => ({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    maxHeight: "90%",
    backgroundColor: th.c.bg,
    borderTopLeftRadius: th.radius.xl,
    borderTopRightRadius: th.radius.xl,
    padding: th.space.lg,
    gap: th.space.md,
  },
  form: { gap: th.space.sm },
  actions: { flexDirection: "row", gap: th.space.sm },
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
  candidate: {
    padding: th.space.md,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface,
    gap: 2,
  },
  candidateOn: { borderColor: th.c.olive, backgroundColor: th.c.oliveSoft },
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
}));
