/**
 * Desktop layout of the web app (web, width ≥ 1024 px): a side menu in the
 * Ministry colours (forest band, seal, gold rule) instead of the phone's header
 * and bottom bar, and the screen content centred with a comfortable width.
 * On the phone and on narrow windows nothing changes.
 */
import { Building2, Inbox, LayoutDashboard, LogOut, Map, Menu, TreeDeciduous, Trees, House, ScanLine } from "lucide-react-native";
import React from "react";
import { Image, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { AuthUser } from "../api/client";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { fr } from "../i18n/fr";
import { TabKey, tabsForRole } from "../navigation/tabs";

const SEAL = require("../../assets/leaf_logo.jpg");
export const DESKTOP_MIN_WIDTH = 1024;
const CONTENT_MAX_WIDTH = 1280;

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
const ICONS: Record<TabKey, IconComponent> = {
  home: House,
  species: TreeDeciduous,
  identify: ScanLine,
  map: Map,
  history: Trees,
  inbox: Inbox,
  orgs: Building2,
  menu: Menu,
};

/** True on the web when the window is wide enough for the desktop layout. */
export function useDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= DESKTOP_MIN_WIDTH;
}

export interface SideSection {
  key: string;
  label: string;
  icon: IconComponent;
  active: boolean;
  onPress: () => void;
}

interface Props {
  enabled: boolean;
  /** Role-specific areas shown first (company: Accueil, Exploitation…); they replace the « home » entry. */
  sections?: SideSection[];
  sectionsTitle?: string;
  user: AuthUser;
  active: string;
  roleLabel: string;
  orgName?: string | null;
  online?: boolean;
  onChange: (key: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function DesktopFrame({
  enabled,
  sections,
  sectionsTitle,
  user,
  active,
  roleLabel,
  orgName,
  online,
  onChange,
  onLogout,
  children,
}: Props) {
  const t = useTheme();
  const s = useStyles();
  if (!enabled) return <>{children}</>;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name;
  return (
    <View style={s.row} testID="desktop-frame">
      <View style={s.side}>
        <ScrollView contentContainerStyle={s.sideContent}>
          <View style={s.brand}>
            <Image source={SEAL} style={s.seal} resizeMode="contain" accessibilityLabel={fr.header.ministry} />
            <Text style={s.eyebrow}>{fr.appTitle.toUpperCase()}</Text>
            <Text style={s.ministry}>{fr.header.ministry}</Text>
          </View>
          <View style={s.rule} />
          {sections?.length ? (
            <View style={s.nav}>
              {sectionsTitle ? <Text style={s.sectionTitle}>{sectionsTitle}</Text> : null}
              {sections.map((sec) => (
                <Pressable
                  key={sec.key}
                  testID={`side-section-${sec.key}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sec.active }}
                  onPress={sec.onPress}
                  style={(state) => [s.item, sec.active && s.itemOn, (state as { hovered?: boolean }).hovered && !sec.active && s.itemHover]}
                >
                  <sec.icon size={20} color={sec.active ? t.c.gold : t.c.onForest} strokeWidth={sec.active ? 2.4 : 2} />
                  <Text style={[s.itemLabel, sec.active && s.itemLabelOn]}>{sec.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={s.nav}>
            {tabsForRole(user.role).filter((tab) => !(sections?.length && tab.key === "home")).map((tab) => {
              const Icon = user.role === "admin" && tab.key === "home" ? LayoutDashboard : ICONS[tab.key];
              const on = active === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  testID={`side-${tab.key}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => onChange(tab.key)}
                  style={(state) => [s.item, on && s.itemOn, (state as { hovered?: boolean }).hovered && !on && s.itemHover]}
                >
                  <Icon size={20} color={on ? t.c.gold : t.c.onForest} strokeWidth={on ? 2.4 : 2} />
                  <Text style={[s.itemLabel, on && s.itemLabelOn]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={s.footer}>
          <View style={s.status}>
            <View style={[s.dot, { backgroundColor: online === false ? t.c.risk : t.c.ok }]} />
            <Text style={s.statusText}>{online === false ? fr.header.offline : fr.header.online}</Text>
          </View>
          <Text style={s.user} numberOfLines={1}>
            {name}
          </Text>
          <Text style={s.role} numberOfLines={1}>
            {[roleLabel, orgName && orgName !== name ? orgName : null].filter(Boolean).join(" · ")}
          </Text>
          <Pressable testID="side-logout" accessibilityRole="button" onPress={onLogout} style={s.logout}>
            <LogOut size={16} color={t.c.onForest} />
            <Text style={s.logoutText}>{fr.common.logout}</Text>
          </Pressable>
        </View>
      </View>
      <View style={s.main}>
        <View style={s.content}>{children}</View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  row: { flex: 1, flexDirection: "row", backgroundColor: th.c.bg },
  side: { width: 248, backgroundColor: th.c.forest, borderRightWidth: 2, borderRightColor: th.c.gold },
  sideContent: { paddingVertical: th.space.lg, gap: th.space.md },
  brand: { alignItems: "center", gap: 6, paddingHorizontal: th.space.lg },
  seal: { width: 72, height: 56 },
  eyebrow: { color: th.c.gold, fontFamily: th.fonts.displaySemi, fontSize: 11, letterSpacing: 1.2 },
  ministry: { color: th.c.onForest, fontFamily: th.fonts.display, fontSize: 18, textAlign: "center", lineHeight: 22 },
  rule: { height: 1.5, backgroundColor: th.c.gold, marginHorizontal: th.space.lg, opacity: 0.8 },
  nav: { gap: 4, paddingHorizontal: th.space.sm },
  sectionTitle: {
    color: th.c.gold,
    fontFamily: th.fonts.displaySemi,
    fontSize: 11,
    letterSpacing: 1.2,
    paddingHorizontal: th.space.md,
    paddingBottom: 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.md,
    paddingVertical: 11,
    paddingHorizontal: th.space.md,
    borderRadius: th.radius.md,
  },
  itemOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  itemHover: { backgroundColor: "rgba(255,255,255,0.06)" },
  itemLabel: { color: th.c.onForest, fontFamily: th.fonts.body, fontSize: 15 },
  itemLabelOn: { fontFamily: th.fonts.bodyBold, color: th.c.onForest },
  footer: { padding: th.space.lg, gap: 4, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)" },
  status: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: th.c.onForest, fontFamily: th.fonts.body, fontSize: 12, opacity: 0.85 },
  user: { color: th.c.onForest, fontFamily: th.fonts.bodyBold, fontSize: 14 },
  role: { color: th.c.onForest, opacity: 0.8, fontFamily: th.fonts.body, fontSize: 12 },
  logout: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: th.space.sm, paddingVertical: 6 },
  logoutText: { color: th.c.onForest, fontFamily: th.fonts.displaySemi, fontSize: 13 },
  main: { flex: 1, alignItems: "center" },
  content: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH },
}));
