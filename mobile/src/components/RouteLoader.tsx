import React from "react";
import { ActivityIndicator, View } from "react-native";

import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Txt } from "../design/ui";

export default function RouteLoader({ message }: { message: string }) {
  const theme = useTheme();
  const s = useStyles();
  return (
    <View style={s.container} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator color={theme.c.olive} size="large" />
      <Txt tone="muted" bold style={s.message}>
        {message}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  container: {
    flex: 1,
    backgroundColor: th.c.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: th.space.xl,
    gap: th.space.md,
  },
  message: { textAlign: "center" },
}));
