import { MapPin, Target, UserRound } from "lucide-react-native";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

const SEAL = require("../../assets/leaf_logo.jpg");

export interface HeaderCoords {
  latitude: number;
  longitude: number;
}

interface Props {
  title: string;
  subtitle?: string;
  roleLabel?: string | null;
  orgName?: string | null;
  coords?: HeaderCoords | null;
  onOpenProfile?: () => void;
  onOpenProjects?: () => void;
}

export default function RoleHeader({
  title,
  subtitle,
  roleLabel,
  orgName,
  coords,
  onOpenProfile,
  onOpenProjects,
}: Props) {
  return (
    <View style={styles.header}>
      <Image
        source={SEAL}
        style={styles.seal}
        resizeMode="contain"
        accessibilityLabel={fr.header.ministry}
      />
      <View style={styles.texts}>
        <Text style={styles.overline} numberOfLines={1}>
          {title.toUpperCase()}
        </Text>
        <Text
          style={styles.ministry}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {fr.header.ministry}
        </Text>
        {roleLabel ? (
          <View style={styles.metaRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText} numberOfLines={1}>
                {roleLabel}
              </Text>
            </View>
            {orgName ? (
              <Text style={styles.org} numberOfLines={1}>
                {orgName}
              </Text>
            ) : null}
          </View>
        ) : subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {coords !== undefined ? (
          <View style={styles.locRow}>
            <MapPin size={13} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.locText} numberOfLines={1}>
              {coords
                ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
                : fr.header.locating}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        {onOpenProjects ? (
          <TouchableOpacity
            onPress={onOpenProjects}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={fr.header.projects}
          >
            <Target size={18} color={colors.accent} strokeWidth={2} />
            <Text style={styles.actionLabel}>{fr.header.projects}</Text>
          </TouchableOpacity>
        ) : null}
        {onOpenProfile ? (
          <TouchableOpacity
            onPress={onOpenProfile}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={fr.header.profile}
          >
            <UserRound size={18} color={colors.accent} strokeWidth={2} />
            <Text style={styles.actionLabel}>{fr.header.profile}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.primary,
    gap: spacing.sm,
    minHeight: 80,
  },
  seal: { width: 56, height: 44 },
  texts: { flex: 1, minWidth: 0 },
  overline: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  ministry: { color: colors.text, fontSize: 17, fontWeight: "800" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    maxWidth: 130,
  },
  roleBadgeText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  org: { color: colors.textDim, fontSize: 11, flexShrink: 1 },
  subtitle: { color: colors.textDim, fontSize: 11 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  locText: { color: colors.textDim, fontSize: 11, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionBtn: {
    minWidth: 48,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  actionLabel: { color: colors.text, fontSize: 9, fontWeight: "700" },
});
