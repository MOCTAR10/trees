import { RefreshCw } from "lucide-react-native";
import React from "react";
import { Alert, Pressable, Text } from "react-native";

import { makeStyles, useTheme } from "../design/ThemeProvider";
import { fr } from "../i18n/fr";

interface Props {
  ready?: boolean;
  onInstall?: () => void;
}

export default function UpdateBanner({ ready, onInstall }: Props) {
  const t = useTheme();
  const s = useStyles();
  if (!ready) return null;
  return (
    <Pressable
      testID="update-badge"
      accessibilityRole="button"
      accessibilityLabel={fr.update.badge}
      onPress={() =>
        Alert.alert(fr.update.title, fr.update.message, [
          { text: fr.update.later, style: "cancel" },
          { text: fr.update.install, onPress: onInstall },
        ])
      }
      style={s.banner}
      hitSlop={6}
    >
      <RefreshCw size={14} color={t.c.forest} strokeWidth={2.6} />
      <Text style={s.text}>{fr.update.badge}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  banner: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: t.space.lg,
    marginTop: t.space.sm,
    backgroundColor: t.c.gold,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  text: { color: t.c.forest, fontFamily: t.fonts.bodyBold, fontSize: 13, flexShrink: 1 },
}));
