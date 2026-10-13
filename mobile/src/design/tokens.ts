/**
 * Design tokens — Ministère des Eaux et Forêts du Gabon.
 *
 * The palette follows the Ministry's uniform: olive (service dress, dominant),
 * forest green (command stripes, structure), gold (epaulettes and insignia —
 * State authority, used sparingly) and ceremonial white. Every text/background
 * pair below passes WCAG AA in both schemes (see docs/design/maquette_design_v1.html).
 */

export interface Palette {
  /** Brand: primary actions, active tab. */
  olive: string;
  oliveSoft: string;
  onOlive: string;
  /** Structure: headers, official bands. */
  forest: string;
  onForest: string;
  /** Authority accent: seals, measurement guides, active marks. Never large areas. */
  gold: string;
  /** Gold readable as text on the surface. */
  goldInk: string;
  goldSoft: string;
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  ink: string;
  muted: string;
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  risk: string;
  riskSoft: string;
  info: string;
  infoSoft: string;
  shadow: string;
}

export const light: Palette = {
  olive: "#4F5F2A",
  oliveSoft: "#E8ECD9",
  onOlive: "#FFFFFF",
  forest: "#1E4429",
  onForest: "#FFFFFF",
  gold: "#C99A1E",
  goldInk: "#8A6A0E",
  goldSoft: "#F5E9C4",
  bg: "#F5F6F0",
  surface: "#FFFFFF",
  surface2: "#EEF0E6",
  line: "#D9DECB",
  ink: "#1B2114",
  muted: "#5C6650",
  ok: "#2F7D4A",
  okSoft: "#E1F0E5",
  warn: "#9A5F0C",
  warnSoft: "#F8EBD4",
  risk: "#B3362F",
  riskSoft: "#F7E1DF",
  info: "#2C64A6",
  infoSoft: "#E0EAF6",
  shadow: "#1B2114",
};

export const dark: Palette = {
  olive: "#A3B86A",
  oliveSoft: "#263019",
  onOlive: "#10150B",
  forest: "#173A22",
  onForest: "#EDF0E6",
  gold: "#D9B44A",
  goldInk: "#D9B44A",
  goldSoft: "#3A3114",
  bg: "#0F130C",
  surface: "#182014",
  surface2: "#1F2919",
  line: "#2E3A26",
  ink: "#EDF0E6",
  muted: "#A1AB93",
  ok: "#5DBE7E",
  okSoft: "#1C3324",
  warn: "#E0A53A",
  warnSoft: "#3A2C12",
  risk: "#E8786F",
  riskSoft: "#3D1E1B",
  info: "#6FA3E0",
  infoSoft: "#172B42",
  shadow: "#000000",
};

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

/** Font families (loaded in App.tsx with expo-font). */
export const fonts = {
  display: "BarlowSemiCondensed_700Bold",
  displaySemi: "BarlowSemiCondensed_600SemiBold",
  body: "AtkinsonHyperlegible_400Regular",
  bodyBold: "AtkinsonHyperlegible_700Bold",
  bodyItalic: "AtkinsonHyperlegible_400Regular_Italic",
} as const;

/** Type scale: [fontSize, lineHeight]. */
export const scale = {
  hero: [34, 38],
  title: [26, 30],
  heading: [19, 24],
  body: [16, 23],
  small: [14, 20],
  caption: [12, 16],
  label: [11, 14],
} as const;

/** Minimum touch target (gloves, moving vehicle). */
export const TOUCH = 48;
