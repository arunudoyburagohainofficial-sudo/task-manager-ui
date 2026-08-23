import React, { createContext, useContext } from "react";
import { colors as baseColors, ColorPalette } from "../theme/colors";
import { fontFamily, FontFamilyMap } from "../theme/typography";

interface AppearanceContextValue {
  colors: ColorPalette;
  fonts: FontFamilyMap;
}

/**
 * The app's single theming seam. It carries no state any more — the dyslexia-font and
 * high-contrast toggles were removed along with the Display & accessibility settings
 * section — but every component still reads its colors and fonts through here rather than
 * importing the token files directly, so a future theme (dark mode, a restored
 * accessibility palette) plugs in at this one point instead of at ~30 call sites.
 *
 * Module-level constant, not built per render: the value is fixed, so this identity never
 * changes and no consumer re-renders on account of the provider.
 */
const APPEARANCE: AppearanceContextValue = {
  colors: baseColors,
  fonts: fontFamily,
};

const AppearanceContext = createContext<AppearanceContextValue>(APPEARANCE);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  return <AppearanceContext.Provider value={APPEARANCE}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  return useContext(AppearanceContext);
}
