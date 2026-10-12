import React from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { colors, spacing } from "../theme";

/** Soft placeholder rows while catalogue data is hydrating. */
export default function SkeletonList({ rows = 8 }: { rows?: number }) {
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

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.md, gap: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  lineWide: {
    height: 14,
    width: "72%",
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
  },
  lineMid: {
    height: 12,
    width: "48%",
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
  },
  lineShort: {
    height: 10,
    width: "36%",
    borderRadius: 6,
    backgroundColor: colors.border,
  },
});
