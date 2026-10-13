import React from "react";
import { ActivityIndicator, Image, View } from "react-native";

import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const SEAL = require("../../assets/leaf_logo.jpg");

export default function LoadingScreen({ message }: { message?: string }) {
  const theme = useTheme();
  const s = useStyles();
  return (
    <View style={s.container}>
      <View style={s.plate}>
        <Image source={SEAL} style={s.seal} resizeMode="contain" />
      </View>
      <Txt variant="label" style={s.republic}>
        {fr.auth.republic}
      </Txt>
      <Txt variant="title" tone="onForest" style={s.center}>
        {fr.auth.official}
      </Txt>
      <View style={s.rule} />
      <Txt tone="onForest" style={[s.center, s.message]}>
        {message ?? fr.appTitle}
      </Txt>
      <ActivityIndicator color={theme.c.gold} size="large" style={s.spinner} />
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  container: {
    flex: 1,
    backgroundColor: th.c.forest,
    alignItems: "center",
    justifyContent: "center",
    padding: th.space.xl,
    gap: th.space.sm,
  },
  plate: {
    borderRadius: th.radius.md,
    overflow: "hidden",
    marginBottom: th.space.md,
  },
  seal: { width: 132, height: 88 },
  republic: { color: th.c.gold },
  center: { textAlign: "center" },
  rule: { width: 56, height: 2, backgroundColor: th.c.gold, marginVertical: th.space.xs },
  message: { opacity: 0.85 },
  spinner: { marginTop: th.space.lg },
}));
