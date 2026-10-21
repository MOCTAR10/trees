/**
 * Desktop layout of the web app (web, width ≥ 1024 px): a side menu in the
 * Ministry colours (forest band, seal, gold rule) and a top bar carrying the
 * page title, the screens of the current area and the signed-in user, instead
 * of the phone's header and bottom bar. On the phone and on narrow windows
 * nothing changes.
 */
import { Building2, Inbox, LogOut, Map, Menu, PanelLeftClose, PanelLeftOpen, TreeDeciduous, Trees, House, ScanLine } from "lucide-react-native";
import React from "react";
import { Image, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { AuthUser } from "../api/client";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { fr } from "../i18n/fr";
import { TabKey, tabsForRole } from "../navigation/tabs";
import { haptic } from "../utils/haptics";

const SEAL = require("../../assets/leaf_logo.jpg");
export const DESKTOP_MIN_WIDTH = 1024;
const CONTENT_MAX_WIDTH = 1280;
const COLLAPSED_KEY = "fn.sidebar.collapsed";

/** A thin gold scrollbar for the side menu (the browser default is wide and grey). */
const SIDE_SCROLL_CSS = [
  "[data-sidescroll]{scrollbar-width:thin;scrollbar-color:rgba(217,180,74,0.5) transparent}",
  "[data-sidescroll]::-webkit-scrollbar{width:6px}",
  "[data-sidescroll]::-webkit-scrollbar-track{background:transparent}",
  "[data-sidescroll]::-webkit-scrollbar-thumb{background:rgba(217,180,74,0.45);border-radius:3px}",
  "[data-sidescroll]::-webkit-scrollbar-thumb:hover{background:rgba(217,180,74,0.75)}",
].join("");

function useSideScrollStyle(enabled: boolean): void {
  React.useEffect(() => {
    if (!enabled || Platform.OS !== "web" || typeof document === "undefined") return;
    if (document.getElementById("fn-side-scroll")) return;
    const style = document.createElement("style");
    style.id = "fn-side-scroll";
    style.textContent = SIDE_SCROLL_CSS;
    document.head.appendChild(style);
  }, [enabled]);
}

function readCollapsed(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function storeCollapsed(collapsed: boolean): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Private window or blocked storage: the menu simply reopens next time.
  }
}

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
  const [collapsed, setCollapsed] = React.useState(readCollapsed);
  const [hint, setHint] = React.useState<{ label: string; top: number } | null>(null);
  useSideScrollStyle(enabled);
  if (!enabled) return <>{children}</>;
  const showHint = (label: string, e: unknown) => {
    const el = (e as { currentTarget?: { getBoundingClientRect?: () => { top: number; height: number } } }).currentTarget;
    const box = el?.getBoundingClientRect?.();
    if (box) setHint({ label, top: box.top + box.height / 2 });
  };
  const toggleSide = () => {
    haptic("tap");
    setHint(null);
    setCollapsed((v) => {
      storeCollapsed(!v);
      return !v;
    });
  };
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name;
  const tabs = tabsForRole(user.role).filter((tab) => !(sections?.length && tab.key === "home") && !hiddenTabs?.includes(tab.key));
  const pageTitle =
    sections?.find((sec) => sec.active)?.label ??
    groups?.flatMap((g) => g.items).find((sec) => sec.active)?.label ??
    tabs.find((tab) => tab.key === active)?.label ??
    roleLabel;
  const shownTabs = showTopTabs && topTabs && topTabs.length > 1 ? topTabs : null;

  const item = (key: string, testID: string, label: string, Icon: IconComponent, on: boolean, onPress: () => void) =>
    collapsed ? (
      <Pressable
        key={key}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        onPress={onPress}
        onHoverIn={(e) => showHint(label, e)}
        onHoverOut={() => setHint(null)}
        style={(state) => [s.railItem, (state as { hovered?: boolean }).hovered && !on && s.itemHover]}
      >
        <View style={[s.railChip, on && s.iconChipOn]}>
          <Icon size={20} color={on ? t.c.forest : t.c.onForest} strokeWidth={on ? 2.4 : 2} />
        </View>
      </Pressable>
    ) : (
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
  const groupTitle = (title: string) => (collapsed ? <View style={s.railRule} /> : <Text style={s.sectionTitle}>{title}</Text>);
  const toggle = (
    <Pressable
      testID="sidebar-toggle"
      accessibilityRole="button"
      accessibilityLabel={collapsed ? fr.web.showMenu : fr.web.hideMenu}
      accessibilityState={{ expanded: !collapsed }}
      onPress={toggleSide}
      onHoverIn={(e) => (collapsed ? showHint(fr.web.showMenu, e) : undefined)}
      onHoverOut={() => setHint(null)}
      style={(state) => [s.toggle, (state as { hovered?: boolean }).hovered && s.itemHover]}
    >
      {collapsed ? <PanelLeftOpen size={20} color={t.c.gold} /> : <PanelLeftClose size={20} color={t.c.onForest} />}
    </Pressable>
  );

  return (
    <TopTabsContext.Provider value={setTopTabs}>
      <View style={s.row} testID="desktop-frame">
        <View style={[s.side, collapsed && s.rail]} testID="desktop-side" accessibilityState={{ expanded: !collapsed }}>
          <ScrollView contentContainerStyle={[s.sideContent, collapsed && s.railContent]} {...({ dataSet: { sidescroll: "1" } } as object)}>
            {collapsed ? (
              <View style={s.railBrand}>
                <Image source={SEAL} style={s.seal} resizeMode="contain" accessibilityLabel={fr.header.ministry} />
              </View>
            ) : (
              <View style={s.brand}>
                <Image source={SEAL} style={s.seal} resizeMode="contain" accessibilityLabel={fr.header.ministry} />
                <View style={s.brandText}>
                  <Text style={s.eyebrow} numberOfLines={1}>
                    {fr.appTitle.toUpperCase()}
                  </Text>
                  <Text style={s.ministry} numberOfLines={1} testID="side-ministry">
                    {fr.header.ministry}
                  </Text>
                </View>
              </View>
            )}
            <View style={s.rule} />
            {sections?.length ? (
              <View style={s.nav}>
                {sectionsTitle ? groupTitle(sectionsTitle) : null}
                {sections.map((sec) => item(sec.key, `side-section-${sec.key}`, sec.label, sec.icon, sec.active, sec.onPress))}
              </View>
            ) : null}
            <View style={s.nav}>
              {sections?.length ? groupTitle(fr.web.tools) : null}
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
                {groupTitle(g.title)}
                {g.items.map((sec) => item(sec.key, `side-domain-${sec.key}`, sec.label, sec.icon, sec.active, sec.onPress))}
              </View>
            ))}
          </ScrollView>
          <View style={[s.footer, collapsed && s.railFooter]}>
            {collapsed ? toggle : null}
            <Pressable
              testID="side-logout"
              accessibilityRole="button"
              accessibilityLabel={fr.common.logout}
              onPress={onLogout}
              onHoverIn={(e) => (collapsed ? showHint(fr.common.logout, e) : undefined)}
              onHoverOut={() => setHint(null)}
              style={(state) => [s.logout, collapsed && s.railLogout, (state as { hovered?: boolean }).hovered && s.itemHover]}
            >
              <LogOut size={collapsed ? 18 : 16} color={t.c.onForest} />
              {collapsed ? null : <Text style={s.logoutText}>{fr.common.logout}</Text>}
            </Pressable>
            {collapsed ? null : toggle}
          </View>
        </View>
        {collapsed && hint ? (
          <View pointerEvents="none" style={[s.hint, { top: hint.top - 16 }]} testID="side-hint">
            <Text style={s.hintText} numberOfLines={1}>
              {hint.label}
            </Text>
          </View>
        ) : null}
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
  row: { flex: 1, flexDirection: "row", backgroundColor: th.c.bg, position: "relative" },
  side: { width: 256, backgroundColor: th.c.forest, borderRightWidth: 3, borderRightColor: th.c.gold },
  sideContent: { paddingVertical: th.space.lg, gap: th.space.lg },
  brand: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingHorizontal: th.space.lg },
  brandText: { flex: 1, minWidth: 0, gap: 1 },
  seal: { width: 40, height: 40 },
  eyebrow: { color: th.c.gold, fontFamily: th.fonts.displaySemi, fontSize: 11.5, letterSpacing: 1.4 },
  ministry: { color: th.c.onForest, fontFamily: th.fonts.displaySemi, fontSize: 13, lineHeight: 16, opacity: 0.95 },
  toggle: {
    width: 36,
    height: 36,
    borderRadius: th.radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rail: { width: 72 },
  hint: {
    position: "absolute",
    left: 80,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: th.space.md,
    borderRadius: th.radius.md,
    backgroundColor: th.c.forest,
    borderWidth: 1,
    borderColor: th.c.gold,
    zIndex: 20,
  },
  hintText: { color: th.c.onForest, fontFamily: th.fonts.bodyBold, fontSize: 13 },
  railContent: { paddingVertical: th.space.md, gap: th.space.md },
  railBrand: { alignItems: "center", gap: th.space.sm },
  railItem: { alignItems: "center", paddingVertical: 6, marginHorizontal: 6, borderRadius: th.radius.md },
  railChip: { width: 44, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  railRule: { height: 1, backgroundColor: "rgba(217,180,74,0.45)", marginHorizontal: th.space.md, marginVertical: 4 },
  railFooter: { flexDirection: "column", padding: th.space.sm, gap: th.space.xs },
  railLogout: { flex: 0, justifyContent: "center", paddingHorizontal: 10 },
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    padding: th.space.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  logout: {
    flex: 1,
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
  topLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: th.space.lg, minWidth: 0 },
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
