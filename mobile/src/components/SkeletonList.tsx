import React from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { makeStyles, useTheme } from "../design/ThemeProvider";

/** Soft placeholder rows while catalogue data is hydrating. */
export default function SkeletonList({ rows = 8 }: { rows?: number }) {
  const th = useTheme();
  const styles = useStyles();
  const pulse = React.useRef(new Animated.Value(0.4)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 750,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.wrap} accessibilityLabel="Chargement du catalogue">
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View key={i} style={[styles.row, { opacity: pulse }]}>
          <View style={styles.lineWide} />
          <View style={styles.lineMid} />
          <View style={styles.lineShort} />
        </Animated.View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  wrap: { flex: 1, padding: th.space.lg, gap: th.space.sm },
  row: {
    backgroundColor: th.c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.sm,
  },
  lineWide: {
    height: 14,
    width: "72%",
    borderRadius: 6,
    backgroundColor: th.c.surface2,
  },
  lineMid: {
    height: 12,
    width: "48%",
    borderRadius: 6,
    backgroundColor: th.c.surface2,
  },
  lineShort: {
    height: 10,
    width: "36%",
    borderRadius: 6,
    backgroundColor: th.c.line,
  },
}));
