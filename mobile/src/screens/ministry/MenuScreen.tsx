import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Compass,
  Coins,
  FileCheck2,
  FileText,
  Landmark,
  LogOut,
  ScanSearch,
  ScrollText,
  ShieldAlert,
  Trees,
  Truck,
  UserRound,
  Users,
} from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, View } from "react-native";

import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Button, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";
import { DomainKey } from "./shared";

const t = fr.ministry;

type Icon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export const MENU_GROUPS: { key: string; items: { key: DomainKey; icon: Icon }[] }[] = [
  { key: "titres", items: [{ key: "titres", icon: Landmark }, { key: "comptes", icon: Users }] },
  {
    key: "instruction",
    items: [
      { key: "declarations", icon: ClipboardCheck },
      { key: "documents", icon: FileText },
      { key: "etudes", icon: ScrollText },
      { key: "certifications", icon: FileCheck2 },
    ],
  },
  {
    key: "controle",
    items: [
      { key: "controles", icon: ScanSearch },
      { key: "anomalies", icon: ShieldAlert },
      { key: "tracabilite", icon: Truck },
    ],
  },
  { key: "finances", items: [{ key: "fiscal", icon: Coins }] },
  {
    key: "reference",
    items: [
      { key: "autorites", icon: Compass },
      { key: "especes", icon: Trees },
      { key: "profil", icon: UserRound },
    ],
  },
];

interface Props {
  onOpen: (key: DomainKey) => void;
  onLogout: () => void;
}

/** Everything that is not in the bottom bar, grouped like the Ministry's work. */
export default function MenuScreen({ onOpen, onLogout }: Props) {
  const theme = useTheme();
  const s = useStyles();
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} testID="menu-screen">
      <Txt variant="title">{t.menuTitle}</Txt>
      <Pressable
        testID="menu-stats"
        onPress={() => onOpen("stats")}
        accessibilityRole="button"
        style={({ pressed }) => [s.hero, pressed && s.pressed]}
      >
        <View style={s.heroIcon}>
          <BarChart3 size={20} color={theme.c.gold} />
        </View>
        <View style={s.flex}>
          <Txt bold>{t.domains.stats}</Txt>
          <Txt variant="caption" tone="muted">
            {t.domainHints.stats}
          </Txt>
        </View>
      </Pressable>
      {MENU_GROUPS.map((g) => (
        <View key={g.key} style={s.group}>
          <Txt variant="label" tone="gold">
            {t.menuGroups[g.key]}
          </Txt>
          <View style={s.grid}>
            {g.items.map(({ key, icon: Icon }) => (
              <Pressable
                key={key}
                testID={`menu-${key}`}
                onPress={() => onOpen(key)}
                accessibilityRole="button"
                style={({ pressed }) => [s.tile, pressed && s.pressed]}
              >
                <Icon size={18} color={theme.c.olive} strokeWidth={2.1} />
                <Txt variant="small" bold>
                  {t.domains[key]}
                </Txt>
                <Txt variant="caption" tone="muted">
                  {t.domainHints[key]}
                </Txt>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Button
        testID="menu-logout"
        label={fr.common.logout}
        variant="ghost"
        onPress={onLogout}
        icon={<LogOut size={16} color={theme.c.risk} />}
      />
      <View style={s.foot}>
        <BookOpen size={14} color={theme.c.muted} />
        <Txt variant="caption" tone="muted" style={s.flex}>
          Loi 016/01 · RDUE
        </Txt>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.md,
    backgroundColor: th.c.goldSoft,
    borderColor: th.c.gold,
    borderWidth: 1.5,
    borderRadius: th.radius.lg,
    padding: th.space.md,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: th.c.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  group: { gap: th.space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: th.space.sm },
  tile: {
    width: "48.5%",
    minHeight: 84,
    backgroundColor: th.c.surface,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.md,
    gap: 3,
  },
  foot: { flexDirection: "row", alignItems: "center", gap: th.space.xs, justifyContent: "center" },
}));
