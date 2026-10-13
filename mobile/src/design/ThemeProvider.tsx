import React, { createContext, useContext, useMemo } from "react";
import { StyleSheet, useColorScheme } from "react-native";

import { dark, fonts, light, Palette, radius, scale, space } from "./tokens";

export type Scheme = "light" | "dark";

export interface Theme {
  scheme: Scheme;
  c: Palette;
  space: typeof space;
  radius: typeof radius;
  fonts: typeof fonts;
  scale: typeof scale;
}

function themeFor(scheme: Scheme): Theme {
  return { scheme, c: scheme === "dark" ? dark : light, space, radius, fonts, scale };
}

const ThemeContext = createContext<Theme>(themeFor("light"));

/**
 * Light by default (readable in sunlight), dark when the phone is in dark
 * mode. `force` pins a scheme — used for the screens not yet migrated to the
 * new design, which are still drawn dark.
 */
export function ThemeProvider({ force, children }: { force?: Scheme; children: React.ReactNode }) {
  const system = useColorScheme();
  const scheme: Scheme = force ?? (system === "dark" ? "dark" : "light");
  const value = useMemo(() => themeFor(scheme), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** `const useStyles = makeStyles((t) => ({ … }))` — styles that follow the theme. */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: Theme) => T) {
  return function useStyles(): T {
    const theme = useTheme();
    return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
  };
}
