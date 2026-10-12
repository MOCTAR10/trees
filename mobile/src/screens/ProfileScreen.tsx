import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AuthUser } from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

interface Props {
  user: AuthUser;
  onLogout: () => void;
  onBack: () => void;
}

export default function ProfileScreen({ user, onLogout, onBack }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.link}>{fr.history.back}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Nom</Text>
          <Text style={styles.value}>{user.display_name}</Text>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user.email}</Text>
          <Text style={styles.label}>Rôle</Text>
          <Text style={styles.value}>{fr.roles[user.role]}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>{fr.common.logout}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  content: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: { color: colors.textDim, fontSize: type.caption, textTransform: "uppercase" },
  value: { color: colors.text, fontSize: type.body, fontWeight: "600" },
  logoutBtn: {
    backgroundColor: colors.error,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  logoutText: { color: colors.text, fontSize: type.body, fontWeight: "800" },
});
