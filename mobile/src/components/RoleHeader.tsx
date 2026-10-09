import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

interface Props {
  title: string;
  subtitle?: string;
  roleLabel?: string;
  onLogout: () => void;
}

export default function RoleHeader({ title, subtitle, roleLabel, onLogout }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {roleLabel ? <Text style={styles.role}>{roleLabel}</Text> : null}
      </View>
      <TouchableOpacity onPress={onLogout} style={styles.logout}>
        <Text style={styles.logoutText}>{fr.common.logout}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.primary,
  },
  texts: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: type.heading, fontWeight: "800" },
  subtitle: { color: colors.textDim, fontSize: type.caption },
  role: { color: colors.accent, fontSize: type.caption, fontWeight: "700", marginTop: 2 },
  logout: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: { color: colors.text, fontSize: type.caption, fontWeight: "700" },
});
