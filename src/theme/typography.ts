// Fonts: Inter (400/500/600/700/800). Dyslexia toggle swaps the whole app to
// Atkinson Hyperlegible — see useAccessibilitySettings / AccessibilityContext.
// Both are loaded via @expo-google-fonts in App.tsx.

export const fontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extraBold: "Inter_800ExtraBold",
} as const;

export type FontWeightKey = keyof typeof fontFamily;
export type FontFamilyMap = Record<FontWeightKey, string>;

export const dyslexiaFontFamily: FontFamilyMap = {
  regular: "AtkinsonHyperlegible_400Regular",
  medium: "AtkinsonHyperlegible_400Regular",
  semiBold: "AtkinsonHyperlegible_700Bold",
  bold: "AtkinsonHyperlegible_700Bold",
  extraBold: "AtkinsonHyperlegible_700Bold",
} as const;

export const fontSize = {
  timer: 88,
  heroGreeting: 26,
  screenTitle: 24,
  taskDetailTitle: 28,
  xl: 22,
  lg: 19,
  bodyLg: 17,
  body: 16,
  bodySm: 15,
  label: 14,
  caption: 13,
  micro: 12,
  tiny: 11,
} as const;

export const lineHeight = {
  tight: 1.1,
  heading: 1.2,
  body: 1.5,
} as const;
