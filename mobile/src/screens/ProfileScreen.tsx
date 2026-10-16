import { BookOpen, Info, LogOut, Pencil } from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";

import { AuthUser, updateMyNames } from "../api/client";
import { rankForRole } from "../components/RoleHeader";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, KeyValue, RankStripes, ScreenHeader, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.profile;

interface Props {
  user: AuthUser;
  onLogout: () => void;
  onBack: () => void;
  onUserUpdate?: (user: AuthUser) => void;
  onOpenGlossary?: () => void;
  onOpenAbout?: () => void;
  /** Company, cooperative or Ministry the account belongs to. */
  orgName?: string | null;
}

export default function ProfileScreen({ user, onLogout, onBack, onUserUpdate, onOpenGlossary, onOpenAbout, orgName }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const rank = rankForRole(user.role);
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(user.first_name ?? "");
  const [last, setLast] = useState(user.last_name ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name;

  const save = async () => {
    if (!first.trim() || !last.trim()) {
      setMessage({ text: t.namesRequired, error: true });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateMyNames(first.trim(), last.trim());
      onUserUpdate?.({
        ...user,
        first_name: updated.first_name,
        last_name: updated.last_name,
        display_name: updated.display_name,
      });
      setEditing(false);
      setMessage({ text: t.namesSaved, error: false });
    } catch {
      setMessage({ text: t.namesError, error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.screen}>
      <ScreenHeader eyebrow={fr.header.ministry} title={t.title} onBack={onBack} backLabel={fr.history.back} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Card raised>
          <View style={s.identity}>
            <View style={s.avatar}>
              <Txt variant="title" tone="onOlive">
                {(fullName.trim()[0] ?? "?").toUpperCase()}
              </Txt>
            </View>
            <View style={s.identityText}>
              <Txt variant="heading" numberOfLines={2} testID="profile-name">
                {fullName}
              </Txt>
              <View style={s.roleRow}>
                {rank > 0 ? <RankStripes count={rank} color={theme.c.forest} /> : null}
                <Txt variant="small" tone="muted" numberOfLines={1} style={s.flex}>
                  {orgName ? `${fr.roles[user.role]} · ${orgName}` : fr.roles[user.role]}
                </Txt>
              </View>
            </View>
          </View>
          {editing ? (
            <View style={s.form}>
              <Txt variant="caption" tone="muted">
                {t.firstName}
              </Txt>
              <TextInput
                testID="profile-first-name"
                style={s.input}
                value={first}
                onChangeText={setFirst}
                autoCapitalize="words"
                placeholderTextColor={theme.c.muted}
              />
              <Txt variant="caption" tone="muted">
                {t.lastName}
              </Txt>
              <TextInput
                testID="profile-last-name"
                style={s.input}
                value={last}
                onChangeText={setLast}
                autoCapitalize="words"
                placeholderTextColor={theme.c.muted}
              />
              <View style={s.actions}>
                <Button label={t.cancel} variant="secondary" compact onPress={() => setEditing(false)} style={s.flex} />
                <Button testID="profile-save-names" label={t.saveNames} compact loading={saving} onPress={() => void save()} style={s.flex} />
              </View>
            </View>
          ) : (
            <>
              <KeyValue label={t.firstName} value={user.first_name || "—"} />
              <KeyValue label={t.lastName} value={user.last_name || "—"} />
              <KeyValue label={t.matricule} value={user.matricule || t.matriculeNone} />
              <KeyValue label={t.email} value={user.email} />
              <KeyValue label={t.role} value={fr.roles[user.role]} />
              <KeyValue label={t.organisation} value={orgName || "—"} testID="profile-org" />
              <Button
                testID="profile-edit-names"
                label={t.editNames}
                variant="secondary"
                compact
                onPress={() => {
                  setFirst(user.first_name ?? "");
                  setLast(user.last_name ?? "");
                  setEditing(true);
                  setMessage(null);
                }}
                icon={<Pencil size={16} color={theme.c.olive} />}
                style={s.editBtn}
              />
            </>
          )}
          {message ? (
            <Txt variant="small" tone={message.error ? "risk" : "ok"} testID="profile-message">
              {message.text}
            </Txt>
          ) : null}
        </Card>
        {onOpenGlossary ? (
          <Button
            testID="profile-glossary"
            label={fr.glossary.entry}
            variant="secondary"
            onPress={onOpenGlossary}
            icon={<BookOpen size={18} color={theme.c.olive} />}
          />
        ) : null}
        {onOpenAbout ? (
          <Button
            testID="profile-about"
            label={fr.about.entry}
            variant="secondary"
            onPress={onOpenAbout}
            icon={<Info size={18} color={theme.c.olive} />}
          />
        ) : null}
        <Button
          label={fr.common.logout}
          variant="danger"
          onPress={onLogout}
          icon={<LogOut size={18} color="#FFFFFF" />}
        />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.lg },
  flex: { flex: 1 },
  identity: { flexDirection: "row", alignItems: "center", gap: th.space.md, marginBottom: th.space.sm },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: th.c.olive,
    borderWidth: 2,
    borderColor: th.c.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  roleRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  form: { gap: th.space.xs },
  input: {
    minHeight: 48,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface2,
    color: th.c.ink,
    fontFamily: th.fonts.body,
    fontSize: 16,
    paddingHorizontal: th.space.md,
  },
  actions: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.sm },
  editBtn: { alignSelf: "flex-start", marginTop: th.space.sm },
}));
