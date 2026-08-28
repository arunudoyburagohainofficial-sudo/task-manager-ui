/**
 * Focus app — design tokens.
 *
 * Transcribed from designdocs/rn-handoff 2/theme.ts, which is generated from the final
 * design screens and is the single source of truth for styling. Per that handoff: do not
 * introduce colours, sizes or radii that are not in this file — if a value isn't here, it
 * isn't in the design.
 */
import { PixelRatio, type BoxShadowValue, type TextStyle } from "react-native";

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
  /**
   * The segmented control thumb, and the last remaining user of the legacy shadow props.
   * A small neutral lift with no spread, which is all these props can express — every
   * lifted *surface* in the design (stat chips, goal tiles) needs a tinted colour and a
   * negative spread instead, and goes through `lift()` below.
   */
  thumb: {
    shadowColor: "#1A1A1A",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
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

/* ------------------------------------------------------------------- depth */

/**
 * The design's lifted-surface recipe, as a box-shadow stack. Three layers, and all three
 * are load-bearing:
 *
 *  - a 1px near-white rim inset along the top edge — the lit side of the dome;
 *  - a soft inset floor along the bottom, tinted to the surface's own gradient — the
 *    shaded side;
 *  - a drop with *negative spread*, which pulls the shadow in tighter than the card so it
 *    reads as tucked underneath rather than as a halo bleeding out around it.
 *
 * Written as `boxShadow` rather than `shadow*`/`elevation`: those have no spread at all,
 * and Android's elevation draws a neutral system shadow that ignores the tint entirely.
 * Neither can express this, which is why these surfaces have been reading flat next to the
 * design. `boxShadow` is CSS semantics on all three platforms — RN parses it natively and
 * react-native-web hands it straight to the browser, so one array matches the design's own
 * declaration on each.
 *
 * `drop` and `floor` are arguments rather than constants because the design tints each
 * shadow to the gradient sitting above it — terracotta under the streak chip, olive under
 * the done chip, oak under the neutral ones. One grey under all of them is exactly what
 * flattens the set.
 *
 * Returned split across the two Views a clipped gradient surface needs: `outer` belongs on
 * an unclipped wrapper, `inner` on the box carrying `overflow: "hidden"`. They can't share
 * one View — the clip that keeps a gradient inside the rounded corners also clips an outset
 * shadow drawn on that same layer, so the drop would simply vanish.
 */
export function lift(
  drop: string,
  floor: string,
  { variant = "chip", rim = "rgba(255,255,255,.95)" }: { variant?: "chip" | "card"; rim?: string } = {}
): { outer: BoxShadowValue[]; inner: BoxShadowValue[] } {
  const g =
    variant === "card"
      ? { floorY: -4, floorBlur: 8, dropY: 5, dropBlur: 13, dropSpread: -4 }
      : { floorY: -3, floorBlur: 6, dropY: 4, dropBlur: 10, dropSpread: -3 };

  return {
    outer: [{ offsetX: 0, offsetY: g.dropY, blurRadius: g.dropBlur, spreadDistance: g.dropSpread, color: drop }],
    // Design order, kept verbatim: CSS paints the first-listed shadow on top, so the rim
    // has to precede the floor or the floor's blur washes over it.
    inner: [
      { offsetX: 0, offsetY: 1, blurRadius: 0, color: rim, inset: true },
      { offsetX: 0, offsetY: g.floorY, blurRadius: g.floorBlur, color: floor, inset: true },
    ],
  };
}

/* ------------------------------------------------------------------ shading */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/**
 * Shifts a colour's HSL lightness by `delta` (in points, so 8 means +8%), leaving hue and
 * saturation alone. A straight blend toward white/black desaturates as it goes and turns
 * the goal accents chalky; moving lightness keeps them the same colour, only lit
 * differently.
 */
export function shade(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l2 = Math.min(1, Math.max(0, l + delta / 100));
  const c = (1 - Math.abs(2 * l2 - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l2 - c / 2;
  const [r2, g2, b2] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];

  return (
    "#" +
    [r2, g2, b2]
      .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * The two-stop ramp the design draws every goal accent as — a lit top and a shaded bottom
 * of the goal's own colour. Measured off the handoff's two example goals: the blue pair
 * (#A6BEDC → #7B96C0 around #8DA6CC) and the green (#BCD160 → #93AE33 around #A4BF43) both
 * sit at roughly +8 and −6 points of lightness either side of the base, so the ramp is
 * derived rather than hardcoded and any colour the user picks gets the same treatment.
 */
export function accentRamp(hex: string): [string, string] {
  return [shade(hex, 8), shade(hex, -6)];
}
