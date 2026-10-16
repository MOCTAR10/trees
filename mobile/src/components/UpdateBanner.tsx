import { RefreshCw } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, Animated, Easing, Pressable, Text, View } from "react-native";

import { makeStyles, useTheme } from "../design/ThemeProvider";
import { fr } from "../i18n/fr";

interface Props {
  ready?: boolean;
  onInstall?: () => void;
}

const PERIOD_MS = 2200;

export default function UpdateBanner({ ready, onInstall }: Props) {
  const t = useTheme();
  const s = useStyles();
  const pulse = useRef(new Animated.Value(0)).current;
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
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: PERIOD_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [ready, reduced, pulse]);

  if (!ready) return null;

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] });
  const beat = pulse.interpolate({ inputRange: [0, 0.2, 0.5, 1], outputRange: [1, 1.04, 1, 1] });

  return (
    <View style={s.strip} testID="update-strip">
      <View style={s.wrap}>
        {reduced ? null : <Animated.View pointerEvents="none" style={[s.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />}
        <Animated.View style={{ transform: [{ scale: reduced ? 1 : beat }] }}>
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
            style={s.badge}
            hitSlop={6}
          >
            <RefreshCw size={15} color={t.c.forest} strokeWidth={2.6} />
            <Text style={s.text} numberOfLines={1}>
              {fr.update.badge}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  strip: { paddingTop: t.space.xs, paddingBottom: t.space.xs },
  wrap: { alignSelf: "flex-start", justifyContent: "center" },
  halo: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: t.c.gold,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: t.c.gold,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: { color: t.c.forest, fontFamily: t.fonts.bodyBold, fontSize: 13.5, flexShrink: 1 },
}));
