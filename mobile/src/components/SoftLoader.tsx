import React from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { makeStyles, useTheme } from "../design/ThemeProvider";
import { colors } from "../theme";

type SoftLoaderVariant = "full" | "inline" | "bar";

interface Props {
  message?: string;
  variant?: SoftLoaderVariant;
}

/** Branded pulse + indeterminate bar — replaces the yellow ActivityIndicator. */
export default function SoftLoader({ message, variant = "inline" }: Props) {
  const th = useTheme();
  const styles = useStyles();
  const pulse = React.useRef(new Animated.Value(0.35)).current;
  const slide = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const barLoop = Animated.loop(
      Animated.timing(slide, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    pulseLoop.start();
    barLoop.start();
    return () => {
      pulseLoop.stop();
      barLoop.stop();
    };
  }, [pulse, slide]);

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 220],
  });

  if (variant === "bar") {
    return (
      <View style={styles.barTrack} accessibilityRole="progressbar">
        <Animated.View style={[styles.barFill, { transform: [{ translateX }] }]} />
      </View>
    );
  }

  return (
    <View
      style={[styles.wrap, variant === "full" && styles.wrapFull]}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? "Chargement"}
    >
      <Animated.View style={[styles.orb, { opacity: pulse }]}>
        <View style={styles.orbInner} />
      </Animated.View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.barTrackWide}>
        <Animated.View style={[styles.barFillWide, { transform: [{ translateX }] }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: th.space.sm,
    padding: th.space.xl,
  },
  wrapFull: { flex: 1 },
  orb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: th.c.forest,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: th.c.surface2,
  },
  orbInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.flagGreen,
  },
  message: {
    color: th.c.muted,
    fontSize: 12,
    fontFamily: th.fonts.body,
    textAlign: "center",
    marginTop: th.space.xs,
  },
  barTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: th.c.surface2,
    overflow: "hidden",
    marginHorizontal: th.space.lg,
  },
  barFill: {
    width: 72,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.flagGreen,
  },
  barTrackWide: {
    width: 160,
    height: 3,
    borderRadius: 2,
    backgroundColor: th.c.surface2,
    overflow: "hidden",
    marginTop: th.space.sm,
  },
  barFillWide: {
    width: 72,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.flagGreen,
  },
}));
