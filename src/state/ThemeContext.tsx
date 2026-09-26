import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import { dark, light, type Palette, type ThemeMode } from "../theme/palette";
import { atLightness, shade } from "../theme";

const STORAGE_KEY = "appearance-v1";

/**
 * What the user chose, which is not the same as which palette is showing: "system" follows the
 * phone and so resolves differently morning and night.
 */
export type AppearanceChoice = "system" | "light" | "dark";

/**
 * The active palette plus the helpers that depend on it.
 *
 * Handed out as one object so a component destructures once (`const t = useTheme()`) and reads
 * `t.color.text` where it used to read `color.text` — the smallest possible change at each of
 * the ~370 call sites, and one that can't silently keep a light value in dark mode.
 */
export interface Tokens extends Omit<Palette, "goalRing"> {
  isDark: boolean;
  /** A goal's ring, lit for this palette: pale groove in light, deep groove in dark. */
  goalRing: (hex: string) => { track: string; ink: string };
}

interface ThemeContextValue {
  tokens: Tokens;
  /** What the user picked. */
  choice: AppearanceChoice;
  /** Which palette that resolved to right now. */
  mode: ThemeMode;
  /** Applies immediately and persists — a theme is not something you press Save on. */
  setChoice: (choice: AppearanceChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function tokensFor(palette: Palette): Tokens {
  const { goalRing: ring, ...rest } = palette;
  return {
    ...rest,
    isDark: palette.mode === "dark",
    goalRing: (hex: string) => ({
      track: atLightness(hex, ring.trackLightness),
      ink: shade(hex, ring.inkShift),
    }),
  };
}

const LIGHT_TOKENS = tokensFor(light);
const DARK_TOKENS = tokensFor(dark);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<AppearanceChoice>("system");
  const system = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") setChoiceState(stored);
      })
      // An unreadable preference is not a reason to fail to render — fall back to following
      // the phone, which is the default anyway.
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    /*
     * `system` is null until React Native has read the OS setting, and on web it's whatever
     * `prefers-color-scheme` says. Treating null as light rather than waiting avoids a flash of
     * the wrong palette on the first frame — the correct one lands on the very next render.
     */
    const mode: ThemeMode = choice === "system" ? (system === "dark" ? "dark" : "light") : choice;
    return {
      tokens: mode === "dark" ? DARK_TOKENS : LIGHT_TOKENS,
      choice,
      mode,
      setChoice: (next) => {
        setChoiceState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    };
  }, [choice, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * The active palette. Safe outside a provider: falls back to light rather than throwing, because
 * a missing provider should not be able to take the whole app down over a colour.
 */
export function useTheme(): Tokens {
  return useContext(ThemeContext)?.tokens ?? LIGHT_TOKENS;
}

/** The choice, the resolved mode, and the setter — for the one control that changes it. */
export function useAppearance(): Omit<ThemeContextValue, "tokens"> {
  const ctx = useContext(ThemeContext);
  return ctx ?? { choice: "system", mode: "light", setChoice: () => {} };
}

/**
 * A component's stylesheet, built for whichever palette is active.
 *
 * `StyleSheet.create` freezes the values handed to it, so a module-scope stylesheet can never
 * change colour — which is exactly why the theme couldn't switch before. Styles move into a
 * factory instead, and this hook calls it once per (factory, palette) pair and caches the result
 * for every component that shares that factory. Two palettes means at most two stylesheets per
 * component for the life of the process, not one per render.
 *
 * The factory must be defined at module scope (a `const makeStyles = (t: Tokens) => …` beside
 * the component). A factory created inside the component body is a new key each render and the
 * cache never hits.
 */
const styleCache = new WeakMap<object, Map<Palette["mode"], unknown>>();

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: Tokens) => T): T {
  const tokens = useTheme();
  return useMemo(() => {
    let byMode = styleCache.get(factory);
    if (!byMode) {
      byMode = new Map();
      styleCache.set(factory, byMode);
    }
    const hit = byMode.get(tokens.mode);
    if (hit) return hit as T;
    const built = factory(tokens);
    byMode.set(tokens.mode, built);
    return built;
  }, [factory, tokens]);
}

/** Both at once, which is what most converted components need. */
export function useThemed<T extends StyleSheet.NamedStyles<T>>(factory: (t: Tokens) => T): { t: Tokens; styles: T } {
  return { t: useTheme(), styles: useThemedStyles(factory) };
}
