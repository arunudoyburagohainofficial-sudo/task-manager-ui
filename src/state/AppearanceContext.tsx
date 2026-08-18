import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { colors as baseColors, highContrastColors, ColorPalette } from "../theme/colors";
import { dyslexiaFontFamily, fontFamily, FontFamilyMap } from "../theme/typography";

const STORAGE_KEY = "appearance-settings-v1";

interface AppearanceSettings {
  dyslexiaFont: boolean;
  highContrast: boolean;
  /**
   * Stored but not yet applied to an actual alternate palette — the design handoff
   * calls for a "colorblind-safe palette toggle" without specifying its exact colors.
   * Wire this up once that palette is specified.
   */
  colorblindSafe: boolean;
}

const DEFAULT_SETTINGS: AppearanceSettings = {
  dyslexiaFont: false,
  highContrast: false,
  colorblindSafe: false,
};

interface AppearanceContextValue extends AppearanceSettings {
  colors: ColorPalette;
  fonts: FontFamilyMap;
  setDyslexiaFont: (value: boolean) => void;
  setHighContrast: (value: boolean) => void;
  setColorblindSafe: (value: boolean) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
    });
  }, []);

  const persist = (next: AppearanceSettings) => {
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const value = useMemo<AppearanceContextValue>(
    () => ({
      ...settings,
      colors: settings.highContrast ? highContrastColors : baseColors,
      fonts: settings.dyslexiaFont ? dyslexiaFontFamily : fontFamily,
      setDyslexiaFont: (dyslexiaFont) => persist({ ...settings, dyslexiaFont }),
      setHighContrast: (highContrast) => persist({ ...settings, highContrast }),
      setColorblindSafe: (colorblindSafe) => persist({ ...settings, colorblindSafe }),
    }),
    [settings]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within an AppearanceProvider");
  return ctx;
}
