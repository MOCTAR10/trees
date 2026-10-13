import { MapPin, Target, UserRound } from "lucide-react-native";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";

import { Role } from "../api/client";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { RankStripes } from "../design/ui";
import { fr } from "../i18n/fr";
import { ServerStatus } from "../utils/useServerStatus";

const SEAL = require("../../assets/leaf_logo.jpg");

export interface HeaderCoords {
  latitude: number;
  longitude: number;
}

/** Uniform rank: Ministry two stripes, companies / cooperatives one, field agents none. */
export function rankForRole(role: Role | null | undefined): 0 | 1 | 2 {
  if (role === "admin") return 2;
  if (role === "company" || role === "cooperative") return 1;
  return 0;
}

interface Props {
  title: string;
  subtitle?: string;
  roleLabel?: string | null;
  role?: Role | null;
  orgName?: string | null;
  coords?: HeaderCoords | null;
  /** Server reachability, shown as a badge on the location row. */
  connection?: ServerStatus;
  /** Scans waiting to sync (shown while offline). */
  pending?: number;
  onOpenProfile?: () => void;
  onOpenProjects?: () => void;
}

export default function RoleHeader({
  title,
  subtitle,
  roleLabel,
  role,
  orgName,
  coords,
  connection,
  pending = 0,
  onOpenProfile,
  onOpenProjects,
}: Props) {
  const t = useTheme();
  const s = useStyles();
  const rank = rankForRole(role);
  return (
    <View style={s.header}>
      <View style={s.row}>
        <View style={s.sealPlate}>
          <Image source={SEAL} style={s.seal} resizeMode="contain" accessibilityLabel={fr.header.ministry} />
        </View>
        <View style={s.texts}>
          <Text style={s.overline} numberOfLines={1}>
            {title.toUpperCase()}
          </Text>
          <Text style={s.ministry} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {fr.header.ministry}
          </Text>
          {roleLabel ? (
            <View style={s.metaRow}>
              {rank > 0 ? (
                <View style={s.stripesChip}>
                  <RankStripes count={rank} color={t.c.forest} testID="rank-stripes" />
                </View>
              ) : null}
              <Text style={s.role} numberOfLines={1}>
                {roleLabel}
              </Text>
              {orgName ? (
                <>
                  <Text style={s.org}>·</Text>
                  <Text style={s.org} numberOfLines={1}>
                    {orgName}
                  </Text>
                </>
              ) : null}
            </View>
          ) : subtitle ? (
            <Text style={s.org} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={s.actions}>
          {onOpenProjects ? (
            <HeaderAction label={fr.header.projects} onPress={onOpenProjects} icon={<Target size={18} color={t.c.gold} strokeWidth={2} />} />
          ) : null}
          {onOpenProfile ? (
            <HeaderAction label={fr.header.profile} onPress={onOpenProfile} icon={<UserRound size={18} color={t.c.gold} strokeWidth={2} />} />
          ) : null}
        </View>
      </View>
      {coords !== undefined || connection ? (
        <View style={s.locRow}>
          {coords !== undefined ? (
            <>
              <MapPin size={13} color={t.c.gold} strokeWidth={2.5} />
              <Text style={s.locText} numberOfLines={1}>
                {coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : fr.header.locating}
              </Text>
            </>
          ) : null}
          {connection ? <ConnectionBadge status={connection} pending={pending} /> : null}
        </View>
      ) : null}
      <View style={s.rule}>
        <View style={s.ruleLine} />
        <View style={s.ruleLine} />
      </View>
    </View>
  );
}

function ConnectionBadge({ status, pending }: { status: ServerStatus; pending: number }) {
  const s = useStyles();
  const color = status === "online" ? "#5DBE7E" : status === "offline" ? "#E0A53A" : "rgba(255,255,255,0.6)";
  const label =
    status === "online"
      ? fr.header.online
      : status === "offline"
        ? pending > 0
          ? fr.header.offlinePending(pending)
          : fr.header.offline
        : fr.header.checking;
  return (
    <View
      style={[s.badge, status === "offline" && s.badgeOffline]}
      testID="connection-badge"
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <View style={[s.badgeDot, { backgroundColor: color }]} />
      <Text style={s.badgeText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function HeaderAction({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.actionBtn, pressed && s.actionPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
    >
      {icon}
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    backgroundColor: t.c.forest,
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.sm,
    paddingBottom: t.space.md,
    gap: t.space.xs,
  },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md },
  sealPlate: {
    width: 56,
    height: 38,
    borderRadius: t.radius.sm,
    overflow: "hidden",
  },
  seal: { width: 56, height: 38 },
  texts: { flex: 1, minWidth: 0 },
  overline: {
    color: t.c.gold,
    fontFamily: t.fonts.displaySemi,
    fontSize: 11,
    letterSpacing: 1.3,
  },
  ministry: { color: t.c.onForest, fontFamily: t.fonts.display, fontSize: 19, lineHeight: 23 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  stripesChip: {
    backgroundColor: "#EEF0E6",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  role: { color: t.c.onForest, fontFamily: t.fonts.bodyBold, fontSize: 12.5 },
  org: { color: t.c.onForest, opacity: 0.8, fontFamily: t.fonts.body, fontSize: 12.5, flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: t.space.xs },
  actionBtn: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 6,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: "rgba(217,180,74,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  actionPressed: { backgroundColor: "rgba(255,255,255,0.08)" },
  actionLabel: { color: t.c.onForest, fontFamily: t.fonts.displaySemi, fontSize: 10.5 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 68, minHeight: 24 },
  badge: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: t.radius.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  badgeOffline: { backgroundColor: "rgba(224,165,58,0.18)", borderColor: "rgba(224,165,58,0.55)" },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { color: t.c.onForest, fontFamily: t.fonts.bodyBold, fontSize: 11.5 },
  locText: { color: t.c.onForest, opacity: 0.85, fontFamily: t.fonts.body, fontSize: 12, fontVariant: ["tabular-nums"] },
  rule: { position: "absolute", left: 0, right: 0, bottom: 0, height: 4, justifyContent: "space-between" },
  ruleLine: { height: 1.5, backgroundColor: t.c.gold },
}));
