import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { makeStyles, useTheme } from "./ThemeProvider";
import { Palette, TOUCH } from "./tokens";
import { haptic } from "../utils/haptics";
import { useDesktop } from "../web/DesktopFrame";

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export type TextVariant = "hero" | "title" | "heading" | "body" | "small" | "caption" | "label";
export type Tone = "ink" | "muted" | "olive" | "gold" | "ok" | "warn" | "risk" | "info" | "onForest" | "onOlive";

const TONE: Record<Tone, keyof Palette> = {
  ink: "ink",
  muted: "muted",
  olive: "olive",
  gold: "goldInk",
  ok: "ok",
  warn: "warn",
  risk: "risk",
  info: "info",
  onForest: "onForest",
  onOlive: "onOlive",
};

interface TxtProps extends TextProps {
  variant?: TextVariant;
  tone?: Tone;
  bold?: boolean;
  /** Tabular figures in the display face — for measurements. */
  numeric?: boolean;
  style?: StyleProp<TextStyle>;
}

/** Display face for titles and figures; hyperlegible body face for reading. */
export function Txt({ variant = "body", tone = "ink", bold, numeric, style, ...rest }: TxtProps) {
  const t = useTheme();
  const [size, line] = t.scale[variant];
  const display = variant === "hero" || variant === "title" || variant === "heading" || numeric;
  const base: TextStyle = {
    color: t.c[TONE[tone]],
    fontSize: size,
    lineHeight: line,
    fontFamily: display ? t.fonts.display : bold ? t.fonts.bodyBold : t.fonts.body,
  };
  if (variant === "label") {
    base.fontFamily = t.fonts.displaySemi;
    base.letterSpacing = 1.2;
    base.textTransform = "uppercase";
  }
  if (numeric) base.fontVariant = ["tabular-nums"];
  return <Text {...rest} style={[base, style]} />;
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  compact,
  testID,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const t = useTheme();
  const s = useButtonStyles();
  const desktop = useDesktop();
  const fg =
    variant === "primary"
      ? t.c.onOlive
      : variant === "danger"
        ? "#FFFFFF"
        : variant === "gold"
          ? "#1B2114"
          : variant === "secondary"
            ? t.c.olive
            : t.c.ink;
  return (
    <Pressable
      testID={testID}
      onPress={
        onPress
          ? () => {
              haptic(variant === "primary" || variant === "danger" ? "confirm" : "tap");
              onPress();
            }
          : undefined
      }
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={(state) => [
        s.base,
        compact && s.compact,
        desktop && s.desktop,
        desktop && compact && s.desktopCompact,
        s[variant],
        (disabled || loading) && s.disabled,
        desktop && (state as { hovered?: boolean }).hovered && !(disabled || loading) && s.hovered,
        state.pressed && s.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Text style={[s.label, desktop && s.desktopLabel, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const useButtonStyles = makeStyles((t) => ({
  base: {
    minHeight: TOUCH,
    borderRadius: t.radius.md,
    paddingHorizontal: t.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: t.space.sm,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  compact: { minHeight: 38, paddingHorizontal: t.space.md },
  desktop: { minHeight: 42 },
  desktopCompact: { minHeight: 34 },
  hovered: { opacity: 0.88 },
  primary: { backgroundColor: t.c.olive },
  secondary: { backgroundColor: "transparent", borderColor: t.c.olive },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: t.c.risk },
  gold: { backgroundColor: t.c.gold },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  label: { fontFamily: t.fonts.bodyBold, fontSize: 16 },
  desktopLabel: { fontSize: 14.5 },
}));

// ---------------------------------------------------------------------------
// Card, Pill, Stat, SectionTitle, RankStripes, Divider
// ---------------------------------------------------------------------------

export function Card({
  children,
  raised,
  style,
  testID,
}: {
  children: React.ReactNode;
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const s = useCardStyles();
  return (
    <View testID={testID} style={[s.card, raised && s.raised, style]}>
      {children}
    </View>
  );
}

const useCardStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.c.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.c.line,
    padding: t.space.lg,
    gap: t.space.sm,
  },
  raised: {
    borderColor: "transparent",
    shadowColor: t.c.shadow,
    shadowOpacity: t.scheme === "dark" ? 0.4 : 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
}));

export type PillTone = "ok" | "warn" | "risk" | "info" | "gold" | "neutral";

export function Pill({ label, tone = "neutral", testID }: { label: string; tone?: PillTone; testID?: string }) {
  const t = useTheme();
  const map: Record<PillTone, [string, string]> = {
    ok: [t.c.okSoft, t.c.ok],
    warn: [t.c.warnSoft, t.c.warn],
    risk: [t.c.riskSoft, t.c.risk],
    info: [t.c.infoSoft, t.c.info],
    gold: [t.c.goldSoft, t.c.goldInk],
    neutral: [t.c.surface2, t.c.muted],
  };
  const [bg, fg] = map[tone];
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 6,
        backgroundColor: bg,
        borderRadius: t.radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: fg }} />
      <Text style={{ color: fg, fontFamily: t.fonts.displaySemi, fontSize: 12.5, letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

/** A figure with its unit and caption — measurements, counts. */
export function Stat({
  value,
  unit,
  label,
  tone = "ink",
  compact,
  testID,
}: {
  value: string;
  unit?: string;
  label: string;
  tone?: Tone;
  /** Smaller figure for three-up rows on narrow phones. */
  compact?: boolean;
  testID?: string;
}) {
  return (
    <View style={{ flex: 1, gap: 2 }} testID={testID}>
      <Txt variant={compact ? "title" : "hero"} tone={tone} numeric>
        {value}
        {unit ? <Txt variant="small" tone="muted">{` ${unit}`}</Txt> : null}
      </Txt>
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
    </View>
  );
}

export function SectionTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <View style={{ gap: 2 }}>
      {eyebrow ? (
        <Txt variant="label" tone="gold">
          {eyebrow}
        </Txt>
      ) : null}
      <Txt variant="heading">{title}</Txt>
    </View>
  );
}

/**
 * Role marker taken from the uniform: two command stripes for the Ministry,
 * one for companies / cooperatives, none for field agents.
 */
export function RankStripes({ count, color, testID }: { count: 0 | 1 | 2; color: string; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: 3, height: 18, alignItems: "stretch" }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: 4, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}

/** Label / value row of a fact sheet. */
export function KeyValue({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: t.space.md,
        paddingVertical: t.space.sm,
        borderBottomWidth: 1,
        borderBottomColor: t.c.line,
      }}
    >
      <Txt variant="small" tone="muted" style={{ flexShrink: 1 }}>
        {label}
      </Txt>
      <Txt variant="small" bold style={{ flexShrink: 1, textAlign: "right" }}>
        {value}
      </Txt>
    </View>
  );
}

/**
 * Title band for a full screen outside the tabs: forest green with the gold
 * double rule of the Ministry header, an optional back action and right slot.
 */
export function ScreenHeader({
  eyebrow,
  title,
  onBack,
  backLabel,
  right,
  testID,
}: {
  eyebrow?: string;
  title: string;
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  const desktop = useDesktop();
  if (desktop) {
    return (
      <View
        testID={testID}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: t.space.md,
          paddingHorizontal: t.space.lg,
          paddingVertical: t.space.md,
          borderBottomWidth: 1,
          borderBottomColor: t.c.line,
        }}
      >
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel ?? "Retour"}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: t.space.md,
              minHeight: 36,
              borderRadius: t.radius.pill,
              borderWidth: 1,
              borderColor: t.c.line,
              backgroundColor: pressed ? t.c.surface2 : t.c.surface,
            })}
          >
            <Text style={{ color: t.c.olive, fontFamily: t.fonts.display, fontSize: 18, lineHeight: 20 }}>‹</Text>
            <Text style={{ color: t.c.olive, fontFamily: t.fonts.bodyBold, fontSize: 13.5 }}>
              {(backLabel ?? "Retour").replace(/^[←‹<]\s*/, "")}
            </Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? (
            <Text
              numberOfLines={1}
              style={{ color: t.c.goldInk, fontFamily: t.fonts.displaySemi, fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase" }}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={{ color: t.c.ink, fontFamily: t.fonts.display, fontSize: 20, lineHeight: 24 }}>
            {title}
          </Text>
        </View>
        {right}
      </View>
    );
  }
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: t.c.forest,
        paddingHorizontal: t.space.lg,
        paddingTop: t.space.sm,
        paddingBottom: t.space.md + 4,
        flexDirection: "row",
        alignItems: "center",
        gap: t.space.md,
      }}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel ?? "Retour"}
          hitSlop={6}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(217,180,74,0.45)",
            backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "transparent",
          })}
        >
          <Text style={{ color: t.c.gold, fontFamily: t.fonts.display, fontSize: 22, lineHeight: 24 }}>‹</Text>
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          <Text
            numberOfLines={1}
            style={{
              color: t.c.gold,
              fontFamily: t.fonts.displaySemi,
              fontSize: 11,
              letterSpacing: 1.3,
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={{ color: t.c.onForest, fontFamily: t.fonts.display, fontSize: 21, lineHeight: 26 }}>
          {title}
        </Text>
      </View>
      {right}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, justifyContent: "space-between" }}>
        <View style={{ height: 1.5, backgroundColor: t.c.gold }} />
        <View style={{ height: 1.5, backgroundColor: t.c.gold }} />
      </View>
    </View>
  );
}

/** Bulleted note line (measurement quality, flags). */
export function Bullet({ children, tone = "muted" }: { children: string; tone?: Tone }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.space.sm, alignItems: "flex-start" }}>
      <Txt variant="small" tone={tone}>
        •
      </Txt>
      <Txt variant="small" tone={tone} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

/** Segmented control: two to four mutually exclusive views. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: t.c.surface2,
        borderRadius: t.radius.md,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (!on) haptic("select");
              onChange(o.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: t.radius.sm + 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? t.c.surface : "transparent",
              borderWidth: on ? 1 : 0,
              borderColor: t.c.line,
            }}
          >
            <Text
              style={{
                color: on ? t.c.olive : t.c.muted,
                fontFamily: on ? t.fonts.bodyBold : t.fonts.body,
                fontSize: 14.5,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Centered message for empty / error states, with an optional action. */
export function EmptyState({
  message,
  tone = "muted",
  action,
}: {
  message: string;
  tone?: Tone;
  action?: { label: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: t.space.xl, gap: t.space.md }}>
      <Txt tone={tone} style={{ textAlign: "center" }}>
        {message}
      </Txt>
      {action ? <Button label={action.label} variant="secondary" compact onPress={action.onPress} /> : null}
    </View>
  );
}
