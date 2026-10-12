import {
  House,
  Map,
  ScanLine,
  TreeDeciduous,
  Trees,
} from "lucide-react-native";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AuthUser } from "../api/client";
import { TabDef, TabKey, tabsForRole } from "../navigation/tabs";
import { colors, spacing, type } from "../theme";

interface Props {
  user: AuthUser;
  active: string;
  onChange: (key: string) => void;
}

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const ICONS: Record<TabKey, IconComponent> = {
  home: House,
  species: TreeDeciduous,
  identify: ScanLine,
  map: Map,
  history: Trees,
};

// Accent (gold) at ~16% opacity over the dark surface — the active-tab tint.
const ACTIVE_TINT = "rgba(212, 160, 23, 0.16)";

const SPRING = {
  damping: 18,
  stiffness: 260,
  mass: 0.7,
  reduceMotion: ReduceMotion.System,
};

export default function BottomNav({ user, active, onChange }: Props) {
  const tabs = tabsForRole(user.role);

  return (
    <View style={styles.safe}>
      <View style={styles.bar}>
        {tabs.map((tab) => {
          const isCenter = !!tab.centerFor?.includes(user.role);
          const isActive = active === tab.key;
          const Icon = ICONS[tab.key];
          return (
            <TabItem
              key={tab.key}
              tab={tab}
              icon={Icon}
              isCenter={isCenter}
              isActive={isActive}
              onPress={() => onChange(tab.key)}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({
  tab,
  icon: Icon,
  isCenter,
  isActive,
  onPress,
}: {
  tab: TabDef;
  icon: IconComponent;
  isCenter: boolean;
  isActive: boolean;
  onPress: () => void;
}) {
  const pillOpacity = useSharedValue(isActive ? 1 : 0);
  const pillScale = useSharedValue(isActive ? 1 : 0.85);
  const fabScale = useSharedValue(isCenter ? 1 : 0.9);

  useEffect(() => {
    pillOpacity.value = withTiming(isActive && !isCenter ? 1 : 0, { duration: 180 });
    pillScale.value = withSpring(isActive && !isCenter ? 1 : 0.85, SPRING);
  }, [isActive, isCenter, pillOpacity, pillScale]);

  useEffect(() => {
    fabScale.value = withSpring(isCenter ? 1 : 0.9, SPRING);
  }, [isCenter, fabScale]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillOpacity.value,
    transform: [{ scale: pillScale.value }],
  }));
  const fabStyle = useAnimatedStyle(() => ({ transform: [{ scale: fabScale.value }] }));

  const labelStyle = isActive ? styles.labelActive : styles.label;

  return (
    <Pressable
      style={[styles.tab, isCenter && styles.tabCenter]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: isActive }}
    >
      {isCenter ? (
        <>
          <Animated.View style={[styles.fab, fabStyle]}>
            <Icon size={26} color={colors.primary} strokeWidth={2.4} />
          </Animated.View>
          <Text style={labelStyle}>{tab.label}</Text>
        </>
      ) : (
        <>
          <View style={styles.iconSlot}>
            <Animated.View style={[styles.pill, pillStyle]} pointerEvents="none" />
            <Icon
              size={22}
              color={isActive ? colors.accent : colors.textDim}
              strokeWidth={isActive ? 2.2 : 1.8}
            />
          </View>
          <Text style={labelStyle}>{tab.label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: spacing.xs,
    minHeight: 54,
  },
  tabCenter: {
    justifyContent: "flex-end",
  },
  iconSlot: {
    width: 48,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 16,
    backgroundColor: ACTIVE_TINT,
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -26,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  label: {
    color: colors.textDim,
    fontSize: type.caption,
    marginTop: 3,
  },
  labelActive: {
    color: colors.accent,
    fontSize: type.caption,
    fontWeight: "700",
    marginTop: 3,
  },
});
