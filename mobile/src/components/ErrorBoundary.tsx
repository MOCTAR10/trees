import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

interface Props {
  children: React.ReactNode;
  onHome?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort crash catcher: a render crash must never leave the user on a
 * blank white screen with no recourse. Shows the cause (for field reports)
 * plus recovery actions.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("app crash", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{fr.errors.crashTitle}</Text>
        <Text style={styles.detail} numberOfLines={4}>
          {error.message || String(error)}
        </Text>
        <TouchableOpacity style={styles.primary} onPress={this.reset}>
          <Text style={styles.primaryText}>{fr.common.retry}</Text>
        </TouchableOpacity>
        {this.props.onHome ? (
          <TouchableOpacity style={styles.secondary} onPress={this.props.onHome}>
            <Text style={styles.secondaryText}>{fr.errors.home}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { color: colors.error, fontSize: type.heading, fontWeight: "800", textAlign: "center" },
  detail: { color: colors.textDim, fontSize: type.caption, textAlign: "center" },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    alignSelf: "stretch",
  },
  primaryText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    alignSelf: "stretch",
  },
  secondaryText: { color: colors.text, fontSize: type.body, fontWeight: "700" },
});
