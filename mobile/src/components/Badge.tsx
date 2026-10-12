import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { AacStatus, DocStatus, TaxStatus, TitleStatus } from "../api/client";
import { colors, spacing, type } from "../theme";

export type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceAlt, fg: colors.textDim },
  success: { bg: colors.success, fg: "#FFFFFF" },
  warning: { bg: colors.warning, fg: colors.primary },
  danger: { bg: colors.error, fg: "#FFFFFF" },
  accent: { bg: colors.accent, fg: colors.primary },
};

export default function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const c = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function docTone(status: DocStatus): Tone {
  switch (status) {
    case "valide":
      return "success";
    case "rejete":
      return "danger";
    case "soumis":
      return "warning";
    default:
      return "neutral";
  }
}

export function titleTone(status: TitleStatus): Tone {
  if (status === "actif") return "success";
  if (status === "rejete" || status === "retire" || status === "expire") return "danger";
  if (status === "demande") return "neutral";
  return "warning";
}

export function aacTone(status: AacStatus): Tone {
  if (status === "ouvert" || status === "autorise") return "success";
  if (status === "soumis") return "warning";
  return "neutral";
}

export function taxTone(status: TaxStatus): Tone {
  if (status === "paye") return "success";
  if (status === "en_retard") return "danger";
  return "warning";
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  text: { fontSize: type.caption, fontWeight: "800" },
});
