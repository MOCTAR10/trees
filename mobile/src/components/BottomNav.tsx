import {
  House,
  Map,
  ScanLine,
  TreeDeciduous,
  Trees,
} from "lucide-react-native";
import React, { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AuthUser } from "../api/client";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { TabDef, TabKey, tabsForRole } from "../navigation/tabs";

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

const SPRING = {
  damping: 18,
  stiffness: 260,
  mass: 0.7,
  reduceMotion: ReduceMotion.System,
};

export default function BottomNav({ user, active, onChange }: Props) {
  const s = useStyles();
  const tabs = tabsForRole(user.role);

  return (
    <View style={s.bar}>
      {tabs.map((tab) => (
        <TabItem
          key={tab.key}
          tab={tab}
          icon={ICONS[tab.key]}
          isCenter={!!tab.centerFor?.includes(user.role)}
          isActive={active === tab.key}
          onPress={() => onChange(tab.key)}
        />
      ))}
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
  const t = useTheme();
  const s = useStyles();
  const pillOpacity = useSharedValue(isActive ? 1 : 0);
  const pillScale = useSharedValue(isActive ? 1 : 0.85);

  useEffect(() => {
    pillOpacity.value = withTiming(isActive && !isCenter ? 1 : 0, { duration: 180 });
    pillScale.value = withSpring(isActive && !isCenter ? 1 : 0.85, SPRING);
  }, [isActive, isCenter, pillOpacity, pillScale]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillOpacity.value,
    transform: [{ scale: pillScale.value }],
  }));

  return (
    <Pressable
      style={s.tab}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: isActive }}
    >
      {isCenter ? (
        <View style={s.fab}>
          <Icon size={26} color={t.c.onOlive} strokeWidth={2.4} />
        </View>
      ) : (
        <View style={s.iconSlot}>
          <Animated.View style={[s.pill, pillStyle]} pointerEvents="none" />
          <Icon size={22} color={isActive ? t.c.olive : t.c.muted} strokeWidth={isActive ? 2.3 : 1.8} />
        </View>
      )}
      <Text style={[s.label, isActive && s.labelActive, isCenter && s.labelCenter]}>{tab.label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: t.c.surface,
    borderTopWidth: 1,
    borderTopColor: t.c.line,
    paddingTop: t.space.xs,
    paddingBottom: t.space.sm,
    paddingHorizontal: t.space.xs,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 56,
    gap: 3,
  },
  iconSlot: {
    width: 56,
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
    backgroundColor: t.c.oliveSoft,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: t.c.olive,
    borderWidth: 3,
    borderColor: t.c.gold,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -28,
    shadowColor: t.c.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  label: { color: t.c.muted, fontFamily: t.fonts.body, fontSize: 12 },
  labelActive: { color: t.c.olive, fontFamily: t.fonts.bodyBold },
  labelCenter: { color: t.c.ink, fontFamily: t.fonts.bodyBold },
}));
