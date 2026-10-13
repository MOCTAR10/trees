import { LogOut } from "lucide-react-native";
import React from "react";
import { ScrollView, View } from "react-native";

import { AuthUser } from "../api/client";
import { rankForRole } from "../components/RoleHeader";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, KeyValue, RankStripes, ScreenHeader, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.profile;

interface Props {
  user: AuthUser;
  onLogout: () => void;
  onBack: () => void;
}

export default function ProfileScreen({ user, onLogout, onBack }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const rank = rankForRole(user.role);
  return (
    <View style={s.screen}>
      <ScreenHeader eyebrow={fr.header.ministry} title={t.title} onBack={onBack} backLabel={fr.history.back} />
      <ScrollView contentContainerStyle={s.content}>
        <Card raised>
          <View style={s.identity}>
            <View style={s.avatar}>
              <Txt variant="title" tone="onOlive">
                {(user.display_name?.trim()[0] ?? "?").toUpperCase()}
              </Txt>
            </View>
            <View style={s.identityText}>
              <Txt variant="heading" numberOfLines={2}>
                {user.display_name}
              </Txt>
              <View style={s.roleRow}>
                {rank > 0 ? <RankStripes count={rank} color={theme.c.forest} /> : null}
                <Txt variant="small" tone="muted">
                  {fr.roles[user.role]}
                </Txt>
              </View>
            </View>
          </View>
          <KeyValue label={t.name} value={user.display_name} />
          <KeyValue label={t.email} value={user.email} />
          <KeyValue label={t.role} value={fr.roles[user.role]} />
        </Card>
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
}));
