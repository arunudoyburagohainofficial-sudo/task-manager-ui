/**
 * Focus app — design tokens.
 *
 * Transcribed from designdocs/rn-handoff 2/theme.ts, which is generated from the final
 * design screens and is the single source of truth for styling. Per that handoff: do not
 * introduce colours, sizes or radii that are not in this file — if a value isn't here, it
 * isn't in the design.
 */
import { PixelRatio, type TextStyle } from "react-native";

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
  /** Tint behind danger-coloured text (the overdue count pill) — same role fill plays for neutral. */
  dangerFill: "#F7E4E4",

  // companion (character only — never a surface or button)
  ferne: "#DF6D41",
  /**
   * Ferne's shading range. Only the character may use these — they're deliberately outside
   * the UI palette so a shade of the mascot can never end up as a button or a card.
   * The rest of her colours are existing tokens: buttercream is `screen`, ink is `text`,
   * slate is `textMuted`, and the blue accent is `goal`.
   */
  ferneLight: "#F0A382",
  fernePale: "#F2CDB8",
  ferneDeep: "#8E3D1D",
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
 * How far the OS text-size setting is allowed to enlarge this app's type.
 *
 * Android's "Font size" (and iOS Dynamic Type) multiplies every fontSize before layout.
 * Padding and icon sizes don't scale with it, so on a device set well above 1.0 the rows
 * grow much taller while the screen doesn't — which is why a phone at a large font setting
 * fits one task where the web build fits two.
 *
 * Capped rather than disabled: someone who has asked for larger text should still get it,
 * just not so much that the layout stops working. 1.0 would match the web exactly and
 * ignore the setting entirely.
 */
const MAX_FONT_SCALE = 1.15;

/**
 * Global type-size trim, applied on top of the OS cap above.
 *
 * The design was drawn at a comfortable desktop scale, and on a phone — particularly one
 * with Android's Display size turned up, which shrinks the dp grid itself and is invisible
 * to getFontScale() — it left the To do list with room for a single row. Taking ~10% off
 * every size buys back roughly two rows without redrawing anything.
 *
 * One knob rather than 40 edited numbers: every size in the app is derived from `type`
 * below, so changing this is how the whole scale is retuned.
 */
const TYPE_SCALE = 0.9;

/**
 * Read once at module load. A change to the OS setting takes effect on the next app start,
 * which is the same moment the rest of the type scale would be re-evaluated anyway.
 *
 * Exported (not just used internally by `text()`) for the rare literal that sits outside
 * `t()`'s `extra` and so never sees this correction on its own — e.g. a `lineHeight` set on
 * a component's `style` prop rather than merged into its token. `t()` still applies this
 * automatically to anything passed through it; reach for this only when a value genuinely
 * can't go through `t()`.
 */
export const FONT_SCALE_CORRECTION = (() => {
  const scale = PixelRatio.getFontScale();
  const capped = scale > MAX_FONT_SCALE ? MAX_FONT_SCALE / scale : 1;
  return capped * TYPE_SCALE;
})();

/**
 * Resolves a design type token into a React Native text style, attaching the font family
 * that actually carries that weight. Always compose text styles through this rather than
 * spreading a token directly, or the weight silently falls back to Regular on Android.
 *
 * The correction is applied to the *merged* size, after `extra`, so a caller that
 * overrides fontSize is capped too — otherwise every `t(T.body, { fontSize: 15 })` would
 * quietly opt itself back out.
 */
export function text(token: TypeToken, extra?: TextStyle): TextStyle {
  const style: TextStyle = {
    ...token,
    fontFamily: FAMILY_BY_WEIGHT[String(token.fontWeight)] ?? font.semiBold,
    ...extra,
  };

  if (FONT_SCALE_CORRECTION !== 1) {
    if (typeof style.fontSize === "number") style.fontSize *= FONT_SCALE_CORRECTION;
    // Explicit line heights have to move with the text, or capped type sits in gaps sized
    // for the uncapped version.
    if (typeof style.lineHeight === "number") style.lineHeight *= FONT_SCALE_CORRECTION;
  }

  return style;
}

/**
 * Vertical rhythm, trimmed alongside TYPE_SCALE. `gutter` is deliberately left at 20 —
 * it's the screen's horizontal margin, which has no bearing on how many rows fit and
 * narrowing it would make the content look cramped against the edges.
 */
export const space = { xs: 3, sm: 7, md: 9, base: 10, card: 13, gutter: 20, lg: 20 } as const;

export const radius = {
  card: 12,
  control: 10,
  track: 11,
  thumb: 9,
  tab: 8,
  toggle: 14,
  pill: 999,
} as const;

/**
 * Retuned alongside `type`/`space` when TYPE_SCALE shipped — that pass shrank Home's rows
 * and text but left every *control* (Button, TextField, Segmented, Toggle, and any icon
 * called without an explicit size override) at its original dimensions, which is why they
 * now read as oversized next to Home's tightened lists.
 *
 * `minTouch` is the one exception, held at 44 rather than trimmed with the rest: it's not
 * a stylistic size, it's Apple/Android's minimum touch-target guideline, and it was
 * already sitting at that floor before this pass. `button` had 6px of genuine slack above
 * the floor and comes down; `minTouch` itself does not move.
 */
export const size = {
  minTouch: 44,
  button: 46,
  toggleW: 44,
  toggleH: 26,
  toggleKnob: 20,
  icon: 19, // in-row icon marks
  iconLg: 22, // standalone icon in a card
  iconInline: 16, // inside a text run — use the 2-shape variant
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
  /**
   * Home's lifted surfaces — stat chips, task rows, goal tiles. Warm-tinted rather than
   * neutral grey: on a cream/gradient field a grey shadow reads as dirt under the card.
   * Deliberately soft and low-contrast; this is depth, not a drop shadow.
   */
  card: {
    shadowColor: "#8E5A3D",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  /** Slightly stronger, for the one element meant to sit above the rest. */
  raised: {
    shadowColor: "#8E5A3D",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
} as const;

/**
 * The wash behind Home. Four barely-there colour fields bled into the cream ground — the
 * screen token stays the base so anything that doesn't paint the gradient still matches.
 * Kept this low in saturation on purpose: it should register as light in the room rather
 * than as a coloured background.
 */
export const homeWash = {
  base: color.screen,
  violet: "#EFE4F5",
  blush: "#F8DFD4",
  mint: "#E4F0E2",
  sand: "#FBF1DE",
} as const;
