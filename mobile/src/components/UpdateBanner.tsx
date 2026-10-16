import { ChevronRight } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, Animated, Easing, Pressable, Text, View } from "react-native";

import { makeStyles } from "../design/ThemeProvider";
import { fr } from "../i18n/fr";

interface Props {
  ready?: boolean;
  onInstall?: () => void;
}

const PERIOD_MS = 2600;

export default function UpdateBanner({ ready, onInstall }: Props) {
  const s = useStyles();
  const wave = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || reduced) return undefined;
    wave.setValue(0);
    const loop = Animated.loop(
      Animated.timing(wave, { toValue: 1, duration: PERIOD_MS, easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [ready, reduced, wave]);

  if (!ready) return null;

  const ringScale = wave.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] });
  const ringOpacity = wave.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.55, 0.12, 0] });
  const breathe = wave.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.92, 1, 0.92] });

  return (
    <View style={s.strip} testID="update-strip">
      <Animated.View style={{ opacity: reduced ? 1 : breathe, alignSelf: "flex-start" }}>
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
          style={({ pressed }) => [s.pill, pressed && s.pressed]}
          hitSlop={6}
        >
          <View style={s.dotBox}>
            {reduced ? null : <Animated.View pointerEvents="none" style={[s.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />}
            <View style={s.dot} />
          </View>
          <Text style={s.text} numberOfLines={1}>
            {fr.update.badge}
          </Text>
          <View style={s.cta}>
            <Text style={s.ctaText}>{fr.update.cta}</Text>
            <ChevronRight size={14} color={s.ctaText.color} strokeWidth={2.8} />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  strip: { paddingTop: t.space.xs, paddingBottom: t.space.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: t.c.gold,
    borderWidth: 1.2,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 5,
    paddingVertical: 5,
  },
  pressed: { opacity: 0.8 },
  dotBox: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 12, height: 12, borderRadius: 6, backgroundColor: t.c.gold },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: t.c.gold },
  text: { color: t.c.onForest, fontFamily: t.fonts.bodyBold, fontSize: 13, flexShrink: 1 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.c.gold,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 5,
    gap: 2,
  },
  ctaText: { color: t.c.forest, fontFamily: t.fonts.bodyBold, fontSize: 12.5 },
}));
