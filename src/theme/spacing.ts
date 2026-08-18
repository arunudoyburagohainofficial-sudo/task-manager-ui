// Base unit 8px; common spacings 8/16/24/32/48 (design_handoff README "Spacing & shape").

export const spacing = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
} as const;

export const radii = {
  control: 8, // buttons/inputs/cards
  modal: 16, // modal cards
  sheet: 24, // bottom sheet top corners
  pill: 999, // chips/tags/toggles
} as const;

/** Minimum touch target — list rows, buttons. */
export const minTouchTarget = 48;
