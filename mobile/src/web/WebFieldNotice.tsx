import { Smartphone } from "lucide-react-native";
import React from "react";
import { Linking, View } from "react-native";

import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const APK_URL = "https://greenleaves.ga/app/foresterie.apk";

/** Web app opened with a field account (agent, cooperative): the work is done on the phone. */
export default function WebFieldNotice({ role, onLogout }: { role: string; onLogout: () => void }) {
  const t = useTheme();
  const s = useStyles();
  return (
    <View style={s.screen} testID="web-field-notice">
      <Card raised style={s.card}>
        <Smartphone size={36} color={t.c.olive} />
        <Txt variant="title">{fr.web.fieldTitle}</Txt>
        <Txt tone="muted">{`${fr.roles[role as keyof typeof fr.roles] ?? role} — ${fr.web.fieldBody}`}</Txt>
        <Button label={fr.web.download} onPress={() => void Linking.openURL(APK_URL)} />
        <Button label={fr.common.logout} variant="ghost" onPress={onLogout} />
      </Card>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: th.space.xl, backgroundColor: th.c.bg },
  card: { maxWidth: 520, gap: th.space.md, alignItems: "flex-start" },
}));
