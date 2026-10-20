/**
 * Desktop layout of the web app (web, width ≥ 1024 px): a side menu in the
 * Ministry colours (forest band, seal, gold rule) and a top bar carrying the
 * page title, the screens of the current area and the signed-in user, instead
 * of the phone's header and bottom bar. On the phone and on narrow windows
 * nothing changes.
 */
import { Building2, Inbox, LogOut, Map, Menu, TreeDeciduous, Trees, House, ScanLine } from "lucide-react-native";
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

export interface SideGroup {
  key: string;
  title: string;
  items: SideSection[];
}

/** A screen of the current area, shown as a tab in the desktop top bar. */
export interface TopTab {
  key: string;
  label: string;
  active: boolean;
  onPress: () => void;
}

const TopTabsContext = React.createContext<((tabs: TopTab[] | null) => void) | null>(null);

/**
 * Puts the screens of the current area in the desktop top bar. Returns true
 * when a top bar took them (the caller then renders no tab row of its own).
 */
export function useDesktopTopTabs(tabs: TopTab[] | null): boolean {
  const set = React.useContext(TopTabsContext);
  const latest = React.useRef(tabs);
  latest.current = tabs;
  const signature = tabs ? tabs.map((tab) => `${tab.key}:${tab.label}:${tab.active ? 1 : 0}`).join("|") : "";
  React.useEffect(() => {
    set?.(latest.current);
  }, [set, signature]);
  React.useEffect(() => () => set?.(null), [set]);
  return set != null;
}

interface Props {
  enabled: boolean;
  /** Role-specific areas shown first (company: Accueil, Exploitation…); they replace the « home » entry. */
  sections?: SideSection[];
  sectionsTitle?: string;
  groups?: SideGroup[];
  hiddenTabs?: TabKey[];
  user: AuthUser;
  active: string;
  roleLabel: string;
  orgName?: string | null;
  online?: boolean;
  /** Whether the screens registered by the current page belong in the top bar now. */
  showTopTabs?: boolean;
  onChange: (key: string) => void;
  onLogout: () => void;
  onOpenProfile?: () => void;
  children: React.ReactNode;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export default function DesktopFrame({
  enabled,
  sections,
  sectionsTitle,
  groups,
  hiddenTabs,
  user,
  active,
  roleLabel,
  orgName,
  online,
  showTopTabs = true,
  onChange,
  onLogout,
  onOpenProfile,
  children,
}: Props) {
  const t = useTheme();
  const s = useStyles();
  const [topTabs, setTopTabs] = React.useState<TopTab[] | null>(null);
  if (!enabled) return <>{children}</>;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name;
  const tabs = tabsForRole(user.role).filter((tab) => !(sections?.length && tab.key === "home") && !hiddenTabs?.includes(tab.key));
  const pageTitle =
    sections?.find((sec) => sec.active)?.label ??
    groups?.flatMap((g) => g.items).find((sec) => sec.active)?.label ??
    tabs.find((tab) => tab.key === active)?.label ??
    roleLabel;
  const shownTabs = showTopTabs && topTabs && topTabs.length > 1 ? topTabs : null;

  const item = (key: string, testID: string, label: string, Icon: IconComponent, on: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={(state) => [s.item, on && s.itemOn, (state as { hovered?: boolean }).hovered && !on && s.itemHover]}
    >
      <View style={[s.mark, on && s.markOn]} />
      <View style={[s.iconChip, on && s.iconChipOn]}>
        <Icon size={18} color={on ? t.c.forest : t.c.onForest} strokeWidth={on ? 2.4 : 2} />
      </View>
      <Text style={[s.itemLabel, on && s.itemLabelOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <TopTabsContext.Provider value={setTopTabs}>
      <View style={s.row} testID="desktop-frame">
        <View style={s.side}>
          <ScrollView contentContainerStyle={s.sideContent}>
            <View style={s.brand}>
              <View style={s.brandTop}>
                <Image source={SEAL} style={s.seal} resizeMode="contain" accessibilityLabel={fr.header.ministry} />
                <Text style={s.eyebrow} numberOfLines={1}>
                  {fr.appTitle.toUpperCase()}
                </Text>
              </View>
              <Text style={s.ministry} numberOfLines={1} testID="side-ministry">
                {fr.header.ministry}
              </Text>
            </View>
            <View style={s.rule} />
            {sections?.length ? (
              <View style={s.nav}>
                {sectionsTitle ? <Text style={s.sectionTitle}>{sectionsTitle}</Text> : null}
                {sections.map((sec) => item(sec.key, `side-section-${sec.key}`, sec.label, sec.icon, sec.active, sec.onPress))}
              </View>
            ) : null}
            <View style={s.nav}>
              {sections?.length ? <Text style={s.sectionTitle}>{fr.web.tools}</Text> : null}
              {tabs.map((tab) =>
                item(
                  tab.key,
                  `side-${tab.key}`,
                  tab.label,
                  ICONS[tab.key],
                  active === tab.key,
                  () => onChange(tab.key),
                ),
              )}
            </View>
            {groups?.map((g) => (
              <View key={g.key} style={s.nav}>
                <Text style={s.sectionTitle}>{g.title}</Text>
                {g.items.map((sec) => item(sec.key, `side-domain-${sec.key}`, sec.label, sec.icon, sec.active, sec.onPress))}
              </View>
            ))}
          </ScrollView>
          <View style={s.footer}>
            <Pressable
              testID="side-logout"
              accessibilityRole="button"
              onPress={onLogout}
              style={(state) => [s.logout, (state as { hovered?: boolean }).hovered && s.itemHover]}
            >
              <LogOut size={16} color={t.c.onForest} />
              <Text style={s.logoutText}>{fr.common.logout}</Text>
            </Pressable>
          </View>
        </View>
        <View style={s.main}>
          <View style={s.topbar} testID="desktop-topbar">
            <View style={s.topInner}>
              <View style={s.topLeft}>
                <View style={s.titleBlock}>
                  <Text style={s.topEyebrow} numberOfLines={1}>
                    {(sectionsTitle ?? roleLabel).toUpperCase()}
                  </Text>
                  <Text style={s.topTitle} numberOfLines={1} testID="topbar-title">
                    {pageTitle}
                  </Text>
                </View>
                {shownTabs ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
                    {shownTabs.map((tab) => (
                      <Pressable
                        key={tab.key}
                        testID={`topbar-tab-${tab.key}`}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: tab.active }}
                        onPress={tab.onPress}
                        style={(state) => [
                          s.tab,
                          tab.active && s.tabOn,
                          (state as { hovered?: boolean }).hovered && !tab.active && s.tabHover,
                        ]}
                      >
                        <Text style={[s.tabLabel, tab.active && s.tabLabelOn]} numberOfLines={1}>
                          {tab.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
              <View style={s.topRight}>
                <View style={[s.status, online === false && s.statusOff]} testID="topbar-status">
                  <View style={[s.dot, { backgroundColor: online === false ? t.c.risk : t.c.ok }]} />
                  <Text style={[s.statusText, { color: online === false ? t.c.risk : t.c.ok }]}>
                    {online === false ? fr.header.offline : fr.header.online}
                  </Text>
                </View>
                <Pressable
                  testID="topbar-user"
                  accessibilityRole={onOpenProfile ? "button" : undefined}
                  disabled={!onOpenProfile}
                  onPress={onOpenProfile}
                  style={(state) => [s.userBox, (state as { hovered?: boolean }).hovered && onOpenProfile ? s.userHover : null]}
                >
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{initials(name)}</Text>
                  </View>
                  <View style={s.userText}>
                    <Text style={s.user} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={s.role} numberOfLines={1}>
                      {[roleLabel, orgName && orgName !== name ? orgName : null].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
          <View style={s.content}>{children}</View>
        </View>
      </View>
    </TopTabsContext.Provider>
  );
}

const useStyles = makeStyles((th) => ({
  row: { flex: 1, flexDirection: "row", backgroundColor: th.c.bg },
  side: { width: 272, backgroundColor: th.c.forest, borderRightWidth: 3, borderRightColor: th.c.gold },
  sideContent: { paddingVertical: th.space.lg, gap: th.space.lg },
  brand: { gap: th.space.sm, paddingHorizontal: th.space.lg },
  brandTop: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  seal: { width: 40, height: 40 },
  eyebrow: { flex: 1, color: th.c.gold, fontFamily: th.fonts.displaySemi, fontSize: 11.5, letterSpacing: 1.4 },
  ministry: { color: th.c.onForest, fontFamily: th.fonts.display, fontSize: 16, lineHeight: 20 },
  rule: { height: 2, backgroundColor: th.c.gold, marginHorizontal: th.space.lg, opacity: 0.85 },
  nav: { gap: 2, paddingHorizontal: th.space.sm },
  sectionTitle: {
    color: th.c.gold,
    fontFamily: th.fonts.displaySemi,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingHorizontal: th.space.md,
    paddingBottom: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.md,
    minHeight: 46,
    paddingRight: th.space.md,
    borderRadius: th.radius.md,
    overflow: "hidden",
  },
  itemOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  itemHover: { backgroundColor: "rgba(255,255,255,0.07)" },
  mark: { width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: "transparent" },
  markOn: { backgroundColor: th.c.gold },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  iconChipOn: { backgroundColor: th.c.gold },
  itemLabel: { flex: 1, color: th.c.onForest, fontFamily: th.fonts.body, fontSize: 15, opacity: 0.9 },
  itemLabelOn: { fontFamily: th.fonts.bodyBold, opacity: 1 },
  footer: { padding: th.space.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)" },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: th.space.md,
    borderRadius: th.radius.md,
  },
  logoutText: { color: th.c.onForest, fontFamily: th.fonts.displaySemi, fontSize: 14 },
  main: { flex: 1, alignItems: "stretch" },
  topbar: {
    backgroundColor: th.c.surface,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
    shadowColor: th.c.shadow,
    shadowOpacity: th.scheme === "dark" ? 0.35 : 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 2,
  },
  topInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.lg,
    minHeight: 68,
    paddingHorizontal: th.space.xl,
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH + 2 * th.space.xl,
    alignSelf: "center",
  },
  topLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: th.space.xl, minWidth: 0 },
  titleBlock: { gap: 1, flexShrink: 0, maxWidth: 260 },
  topEyebrow: { color: th.c.goldInk, fontFamily: th.fonts.displaySemi, fontSize: 11, letterSpacing: 1.2 },
  topTitle: { color: th.c.ink, fontFamily: th.fonts.display, fontSize: 22, lineHeight: 26 },
  tabs: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4, backgroundColor: th.c.surface2, borderRadius: th.radius.lg },
  tab: { paddingHorizontal: th.space.lg, paddingVertical: 9, borderRadius: th.radius.md },
  tabOn: { backgroundColor: th.c.olive },
  tabHover: { backgroundColor: th.c.surface },
  tabLabel: { color: th.c.muted, fontFamily: th.fonts.bodyBold, fontSize: 14.5 },
  tabLabelOn: { color: th.c.onOlive },
  topRight: { flexDirection: "row", alignItems: "center", gap: th.space.md, flexShrink: 0 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: th.radius.pill,
    backgroundColor: th.c.okSoft,
  },
  statusOff: { backgroundColor: th.c.riskSoft },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: th.fonts.displaySemi, fontSize: 12.5 },
  userBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: th.space.md,
    borderRadius: th.radius.pill,
    borderWidth: 1,
    borderColor: th.c.line,
    maxWidth: 320,
  },
  userHover: { backgroundColor: th.c.surface2 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: th.c.forest,
    borderWidth: 2,
    borderColor: th.c.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: th.c.onForest, fontFamily: th.fonts.display, fontSize: 14 },
  userText: { flexShrink: 1 },
  user: { color: th.c.ink, fontFamily: th.fonts.bodyBold, fontSize: 14 },
  role: { color: th.c.muted, fontFamily: th.fonts.body, fontSize: 12 },
  content: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
}));
