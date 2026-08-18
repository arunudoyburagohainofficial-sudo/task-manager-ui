// Design tokens from design_handoff_focus_capture_app/README.md — "Design Tokens > Colors".
// Keep these values in sync with that doc; it's the source of truth, not this file.

export const colors = {
  primary: "#2D7D4C", // Primary buttons, progress bars, active toggles, timer accents, links
  primaryTintBg: "#E4F0E9", // Work category tag bg, info badges, selected chips
  primaryTintText: "#1F5A36",
  primaryHover: "#256A40", // Primary button hover/pressed

  secondary: "#D4A574", // Celebration, XP/points, milestone bars
  secondaryText: "#B07E42", // XP text (meets contrast on light bg)
  secondaryTintBg: "#F6EBDC", // Personal category tag
  secondaryTintText: "#7A5A32",

  healthSwatch: "#5B8DB8",
  healthTintText: "#3E6A8E",

  textDark: "#1A1A1A", // All body text, headings
  textMuted: "#5A5A56", // Secondary text
  textFaint: "#8A8A85", // Labels, captions (12-14px only)

  bgScreen: "#F5F5F5", // App/screen background
  bgCard: "#FFFFFF", // Cards, modals
  borderCard: "#E6E6E3", // 1px card borders
  divider: "#F0F0EE", // Row separators inside cards

  neutralFill: "#EAEAE7", // Secondary buttons, track bgs, segmented control bg
  neutralFillText: "#4A4A46",
  toggleOff: "#D5D5D2", // Inactive toggle, input borders
  toggleOffDashed: "#B9B9B5",

  destructive: "#E74C3C", // Destructive actions ONLY (delete, end session, stop)

  warningTintBg: "#FBF3E8", // Offline banner, in-progress notes
  warningTintBorder: "#E8D5BC",
  warningTintText: "#7A5A32",

  // Focus Session screen background is deliberately calmer than the standard screen bg.
  bgFocusSession: "#FBFBFA",
} as const;

/** High-contrast mode overrides (see design handoff screen S7). */
export const highContrastColors = {
  ...colors,
  bgScreen: "#FFFFFF",
  bgCard: "#FFFFFF",
  borderCard: "#1A1A1A",
  textMuted: "#1A1A1A",
  textFaint: "#1A1A1A",
  primaryTintBg: "#1F5A36",
  primaryTintText: "#FFFFFF",
} as const;

export type ColorToken = keyof typeof colors;
export type ColorPalette = Record<ColorToken, string>;
