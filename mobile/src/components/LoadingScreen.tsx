import React from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

const SEAL = require("../../assets/leaf_logo.jpg");

export default function LoadingScreen({ message }: { message?: string }) {
  return (
    <View style={styles.container}>
      <Image source={SEAL} style={styles.seal} resizeMode="contain" />
      <Text style={styles.title}>{fr.appTitle}</Text>
      <Text style={styles.republic}>{message ?? fr.auth.republic}</Text>
      <ActivityIndicator color={colors.accent} size="large" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  seal: { width: 132, height: 88 },
  spinner: { marginTop: spacing.md },
  title: { color: colors.text, fontSize: type.heading, fontWeight: "800", marginTop: spacing.lg },
  republic: {
    color: colors.textDim,
    fontSize: type.body,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
});
