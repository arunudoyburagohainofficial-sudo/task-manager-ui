/**
 * Focus app — design tokens.
 *
 * Transcribed from designdocs/rn-handoff 2/theme.ts, which is generated from the final
 * design screens and is the single source of truth for styling. Per that handoff: do not
 * introduce colours, sizes or radii that are not in this file — if a value isn't here, it
 * isn't in the design.
 */
import type { TextStyle } from "react-native";

export const color = {
  // surfaces
  screen: "#FDF8EA",
  card: "#FFFFFF",
  fill: "#F1E7D3", // secondary button, inert control
  track: "#F5EBD6", // segmented track, progress track bg
  border: "#EDE0C6",
  divider: "#F2E8D5",
  toggleOff: "#D8D8D2", // ⚠ NOT MEASURED — see note below

  // text
  text: "#1F2927",
  textBody: "#3A4642",
  textMuted: "#68736F",
  textFaint: "#97A19D",
  textLabel: "#7E8985", // uppercase eyebrows

  // the one interaction colour
  interactive: "#BE816E",
  interactivePress: "#9C6252",
  onInteractive: "#FFFFFF", // see A11Y note below
  selectedTint: "#FBEEE9",
  selectedText: "#8A4A22",

  // progress (never interactive)
  progress: "#167C72",

  // completion / positive
  success: "#2E6B3F",
  successFill: "#E6F0C3",
  successBorder: "#CFE7DC",
  doneFill: "#F5F6E2",
  doneBorder: "#E2E7BE",
  doneText: "#7E9433",
  doneCheck: "#A4BF43",

  // reminder / soon
  amberFill: "#FFF4DC",
  amberText: "#9A6B14",
  amberLabel: "#C08A1E",

  // goal accent
  goal: "#8DA6CC",

  // task-type tile (Home's To do / Completed rows) — completed reuses doneCheck as its icon
  // colour rather than a seventh token, since it's the same olive already defined above.
  taskTypeReminderBg: "#E8EEF6",
  taskTypeReminderFg: "#4C7BB5",
  taskTypeFocusBg: "#FBEADF",
  taskTypeFocusFg: "#B4562C",
  taskTypeCompletedBg: "#EAEFD3",

  // destructive
  danger: "#9D131B",
  dangerBorder: "#D95C5C",

  // companion (character only — never a surface or button)
  ferne: "#DF6D41",
} as const;

/**
 * A11Y NOTE — carried over from the handoff, still unresolved.
 * color.onInteractive on color.interactive = 3.15:1, below WCAG AA 4.5:1.
 * Ship one of:
 *   a) interactive: '#9C6252'  (white text -> ~4.8:1)
 *   b) onInteractive: '#3A1610' (dark label on current coral -> ~7:1)
 * Confirm with design before release.
 *
 * UNSPECIFIED IN v1 — color.toggleOff.
 * Every toggle in the final screens is in its ON state, so the off-state track colour was
 * never designed. '#D8D8D2' is a placeholder, not a measured token.
 */

/**
 * Weight-to-family map. The design expresses type as `fontWeight: '800'`, but React Native
 * can't synthesise weights from a static font on Android — each weight is its own loaded
 * family. `text()` below resolves a type token into the family that actually renders it,
 * so screens keep using the design's vocabulary while the platform gets what it needs.
 */
const FAMILY_BY_WEIGHT: Record<string, string> = {
  "600": "PlusJakartaSans_600SemiBold",
  "700": "PlusJakartaSans_700Bold",
  "800": "PlusJakartaSans_800ExtraBold",
};

export const font = {
  semiBold: FAMILY_BY_WEIGHT["600"],
  bold: FAMILY_BY_WEIGHT["700"],
  black: FAMILY_BY_WEIGHT["800"],
} as const;

export const type = {
  timer: { fontSize: 72, fontWeight: "800", letterSpacing: -2.8 },
  h1: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: "800" },
  button: { fontSize: 16, fontWeight: "800" },
  bodyLg: { fontSize: 16, fontWeight: "700" },
  body: { fontSize: 15, fontWeight: "600" },
  label: { fontSize: 14, fontWeight: "800" },
  meta: { fontSize: 13, fontWeight: "600" },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3, textTransform: "uppercase" as const },
  badge: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
} as const;

export type TypeToken = {
  fontSize: number;
  // TextStyle's own union, not `string` — RN rejects a widened weight, and keeping the
  // literal type means a typo in a token is a compile error rather than a silent fallback.
  fontWeight: TextStyle["fontWeight"];
  letterSpacing?: number;
  textTransform?: TextStyle["textTransform"];
};

/**
 * Resolves a design type token into a React Native text style, attaching the font family
 * that actually carries that weight. Always compose text styles through this rather than
 * spreading a token directly, or the weight silently falls back to Regular on Android.
 */
export function text(token: TypeToken, extra?: TextStyle): TextStyle {
  return {
    ...token,
    fontFamily: FAMILY_BY_WEIGHT[String(token.fontWeight)] ?? font.semiBold,
    ...extra,
  };
}

export const space = { xs: 4, sm: 8, md: 10, base: 12, card: 15, gutter: 20, lg: 24 } as const;

export const radius = {
  card: 12,
  control: 10,
  track: 11,
  thumb: 9,
  tab: 8,
  toggle: 14,
  pill: 999,
} as const;

export const size = {
  minTouch: 44,
  button: 50,
  toggleW: 48,
  toggleH: 28,
  toggleKnob: 22,
  icon: 22, // in-row icon marks
  iconLg: 26, // standalone icon in a card
  iconInline: 19, // inside a text run — use the 2-shape variant
  ferne: 46,
} as const;

export const shadow = {
  // the only elevation in the system: the segmented control thumb
  thumb: {
    shadowColor: "#1A1A1A",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
} as const;
