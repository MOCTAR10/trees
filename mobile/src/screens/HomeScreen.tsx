import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

interface Props {
  scanCount: number;
  pendingCount: number;
  syncing: boolean;
  onNew: () => void;
  onHistory: () => void;
  onSync: () => void;
}

export default function HomeScreen({ scanCount, pendingCount, syncing, onNew, onHistory, onSync }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.leaf}>🌳</Text>
      <Text style={styles.title}>{fr.appTitle}</Text>
      <Text style={styles.tagline}>{fr.home.tagline}</Text>

      <TouchableOpacity style={styles.primary} onPress={onNew}>
        <Text style={styles.primaryText}>{fr.home.newScan}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondary} onPress={onHistory}>
        <Text style={styles.secondaryText}>{fr.home.history(scanCount)}</Text>
      </TouchableOpacity>

      {(pendingCount > 0 || syncing) && (
        <TouchableOpacity style={styles.syncButton} onPress={onSync} disabled={syncing}>
          {syncing ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.syncText}>{fr.home.syncQueue(pendingCount)}</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  leaf: { fontSize: 56 },
  title: { color: colors.text, fontSize: type.title, fontWeight: "800" },
  tagline: { color: colors.textDim, fontSize: type.body, textAlign: "center", lineHeight: 22 },
  primary: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    marginTop: spacing.md,
    alignSelf: "stretch",
  },
  primaryText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  secondary: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.text, fontSize: type.body, fontWeight: "600" },
  syncButton: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
});