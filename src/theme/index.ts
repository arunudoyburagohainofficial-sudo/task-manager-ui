/**
 * Focus app — design tokens.
 *
 * Transcribed from designdocs/rn-handoff 2/theme.ts, which is generated from the final
 * design screens and is the single source of truth for styling. Per that handoff: do not
 * introduce colours, sizes or radii that are not in this file — if a value isn't here, it
 * isn't in the design.
 */
import { Dimensions, PixelRatio, type BoxShadowValue, type TextStyle } from "react-native";
import { light } from "./palette";

export type { Palette, ThemeMode } from "./palette";
export { dark, light, palettes } from "./palette";

/**
 * The light palette's colours, for code that hasn't been converted to the theme hook yet and for
 * the handful of module-scope constants that genuinely can't read context (see palette.ts for
 * why colour lives there now). Anything that renders should read `useTheme()` instead — a static
 * import of this object is a value that cannot follow the theme.
 */


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
/*
 * Inter rather than the handoff's Plus Jakarta Sans — a deliberate departure from the design
 * source of truth, made 2026-09-22 for legibility on a phone.
 *
 * Plus Jakarta is a display-leaning geometric sans: at the small sizes this app actually uses
 * (13–15pt for almost all body text) its shorter x-height and tighter apertures cost real
 * readability. Inter was drawn for UI at exactly these sizes — taller x-height, more open
 * counters — so the same fontSize reads noticeably larger and cleaner without any number
 * changing. It's also what apps people compare this to use, which is why theirs "looks more
 * readable" at a glance.
 *
 * Changed here and in App.tsx's useFonts call, and nowhere else: every screen resolves its
 * family through `text()` below, so those two lists are the whole switch. Swapping back is the
 * same two edits.
 */
const FAMILY_BY_WEIGHT: Record<string, string> = {
  // Regular exists for one line: the date under Home's greeting, which the Docked Ferne screens
  // draw at 400. Medium carries the quiet body text on Task Detail.
  "400": "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold",
  "800": "Inter_800ExtraBold",
};

export const font = {
  regular: FAMILY_BY_WEIGHT["400"],
  medium: FAMILY_BY_WEIGHT["500"],
  semiBold: FAMILY_BY_WEIGHT["600"],
  bold: FAMILY_BY_WEIGHT["700"],
  black: FAMILY_BY_WEIGHT["800"],
} as const;

/**
 * One step lighter, everywhere. The single knob for how bold this app is.
 *
 * The type scale below is not the whole story: screens override `fontWeight` inline 106 times,
 * 38 of them at 800. So retuning `type` alone leaves the heaviest text on every screen exactly
 * as it was — which is why the first pass at this changed almost nothing visible.
 *
 * Both resolvers run every weight through this table, whether it came from a token or from a
 * component's own `extra`, so this is genuinely the one place. The design's vocabulary is
 * untouched: a screen still asks for 800 where the handoff says 800, and the relationships
 * between elements are preserved because every step moves together — only the absolute weight
 * drops.
 *
 * Why lighter reads as more breathable: at 600–800 the quiet text weighs the same as the loud
 * text, so nothing recedes, and a screen with no light text has no rest in it. Dropping a step
 * puts body copy at true Regular and leaves Bold meaning something. It matters most in dark
 * mode, where light-on-dark type already gains apparent weight from halation — the old 700 body
 * on charcoal was closer to 800 optically.
 *
 * To go back to the handoff's weights, make this an empty object; every lookup falls through.
 */
const WEIGHT_RELIEF: Record<string, TextStyle["fontWeight"]> = {
  // The top three collapse into one. The handoff spent 800, 700 and 600 on things that sit
  // side by side — a row title, its button, the section header above it — so nothing led.
  "800": "600",
  "700": "600",
  // Body copy drops to Medium and everything quieter to Regular. This is the half that makes
  // the difference: a screen needs light text in it or there is nothing for the bold to be
  // louder *than*.
  "600": "500",
  "500": "400",
  "400": "400",
};

/** The weight actually rendered for a requested one. */
function relieved(weight: TextStyle["fontWeight"]): TextStyle["fontWeight"] {
  return WEIGHT_RELIEF[String(weight)] ?? weight;
}

/**
 * The type scale — sizes, weights and line heights, for every screen.
 *
 * Retuned 2026-09-22 for legibility, away from the handoff's values. The handoff drew almost
 * everything at 600–800 and 13–15pt, which on a phone reads as small, dense and shouty: the
 * quiet text is the same weight as the loud text, so nothing recedes and the eye has nowhere to
 * rest. The apps this gets compared to do the reverse — larger body text at a *lighter* weight,
 * with real space between lines, and heavy weights saved for the few things that are genuinely
 * headings.
 *
 * Three changes, applied together because any one alone does nothing:
 *   - every weight drops a step (600 → 500 for body, 800 → 700 for headings), so bold means
 *     something again
 *   - body and meta go up a point, since a lighter weight needs a little more size to hold
 *   - explicit lineHeight everywhere it matters — this is most of what "breathable" actually
 *     is, and the old scale left it to the platform default of roughly 1.2×
 *
 * `timer` keeps its 800: it's the one number meant to dominate its screen.
 *
 * This object is the single place the whole app's type is set — both `text()` and
 * `textAtDesignSize()` resolve through it, and every screen goes through one of those.
 */
export const type = {
  timer: { fontSize: 72, fontWeight: "800", letterSpacing: -2.5 },
  h1: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4, lineHeight: 33 },
  h2: { fontSize: 21, fontWeight: "700", lineHeight: 28 },
  button: { fontSize: 16, fontWeight: "700" },
  bodyLg: { fontSize: 17, fontWeight: "700", lineHeight: 24 },
  body: { fontSize: 16, fontWeight: "600", lineHeight: 24 },
  label: { fontSize: 15, fontWeight: "600", lineHeight: 22 },
  meta: { fontSize: 14, fontWeight: "500", lineHeight: 20 },
  /*
   * Uppercase tracking down from 1.3 to 0.7. Wide-tracked caps are the loudest thing a UI can
   * do at 11pt — they read as a raised voice, and this app uses them for every section header.
   * Enough tracking to keep the caps legible, not enough to shout.
   */
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" as const },
  badge: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
} as const;

export type TypeToken = {
  fontSize: number;
  // TextStyle's own union, not `string` — RN rejects a widened weight, and keeping the
  // literal type means a typo in a token is a compile error rather than a silent fallback.
  fontWeight: TextStyle["fontWeight"];
  letterSpacing?: number;
  // Carried on the token so line spacing is part of the scale rather than something each screen
  // re-decides. Both resolvers scale it alongside fontSize.
  lineHeight?: number;
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
/** The OS cap on its own, with no TYPE_SCALE trim — see textAtDesignSize. */
const OS_FONT_CAP = (() => {
  const scale = PixelRatio.getFontScale();
  return scale > MAX_FONT_SCALE ? MAX_FONT_SCALE / scale : 1;
})();

/** The width the design was drawn at. Everything below is measured as a fraction of it. */
const DESIGN_WIDTH = 375;

/**
 * How much narrower this device's layout grid is than the one the design assumes.
 *
 * This is the half of the problem `OS_FONT_CAP` above cannot see. Android has two independent
 * settings: **Font size**, which `PixelRatio.getFontScale()` reports, and **Display size**,
 * which it doesn't. Display size raises the screen density, so the same physical panel reports
 * fewer dp — a 360dp phone becomes roughly 320dp — and every fixed size in the app is suddenly
 * a larger share of the screen. Nothing in the app noticed, so on those phones text wrapped
 * mid-word ("Appearanc / e"), rows grew, and two starter tasks filled the whole of Home.
 *
 * Measured from the real window rather than inferred, so it catches Display size, an unusually
 * narrow phone, and a small split-screen pane with the same number.
 *
 * Only ever shrinks. Scaling *up* on a wide phone would inflate a design that already looks
 * right there, and floored at 0.85 so an extreme setting degrades rather than becoming
 * unreadable — past that point the honest answer is fewer rows, not smaller type.
 */
const GRID_SCALE = (() => {
  const { width, height } = Dimensions.get("window");
  // The shorter side, so a device in landscape isn't read as a very wide phone.
  const shortest = Math.min(width, height);
  return Math.max(0.85, Math.min(1, shortest / DESIGN_WIDTH));
})();

/**
 * Read once at module load, like OS_FONT_CAP. Both only change when the OS settings change,
 * which restarts the app anyway.
 */
export const FONT_SCALE_CORRECTION = OS_FONT_CAP * TYPE_SCALE * GRID_SCALE;

/**
 * Rounds a spacing value onto the same grid as the type.
 *
 * Type alone isn't enough: padding and gaps are fixed dp, so shrinking only the text on a
 * compressed grid leaves the same tall rows with smaller writing in them — which reads as a
 * bug rather than a smaller layout. Scaling both keeps the proportions the design intended.
 */
const gridded = (value: number): number => Math.round(value * GRID_SCALE);

/**
 * Resolves a design type token into a React Native text style, attaching the font family
 * that actually carries that weight. Always compose text styles through this rather than
 * spreading a token directly, or the weight silently falls back to Regular on Android.
 *
 * The correction is applied to the *merged* size, after `extra`, so a caller that
 * overrides fontSize is capped too — otherwise every `t(T.body, { fontSize: 15 })` would
 * quietly opt itself back out.
 */
/**
 * A caller's own `fontSize`, carried forward against a token whose `lineHeight` was tuned for
 * its *own* size — found 2026-09-25 chasing an oversized gap in the session-length card.
 *
 * `type` gained explicit `lineHeight` on every token in the breathability pass, each one sized
 * for that token's own `fontSize`. A component overriding `fontSize` without also overriding
 * `lineHeight` — 100+ call sites across the app, mostly places drawing a token a size smaller
 * than its default — was fine before (no token carried a lineHeight to inherit) and silently
 * wrong after: `T.body`'s 16/24 pair, asked for at `fontSize: 13`, hands 13pt text a 24px line
 * box built for 16pt — about 5-6px of invisible padding above and below the glyphs, on both
 * Task Detail's segmented switches and anywhere else this pattern appears.
 *
 * Scaled by the same ratio rather than dropped outright, so the token's *leading* — how loose
 * the line is relative to the glyphs — survives a caller asking for it smaller or larger,
 * rather than falling back to the platform's own default and landing on a different rhythm at
 * every such call site.
 */
function scaledLineHeight(token: TypeToken, extra: TextStyle | undefined): number | undefined {
  const requestedSize = extra?.fontSize;
  if (
    typeof requestedSize !== "number" ||
    requestedSize === token.fontSize ||
    extra?.lineHeight !== undefined ||
    typeof token.lineHeight !== "number"
  ) {
    return extra?.lineHeight ?? token.lineHeight;
  }
  return Math.round(token.lineHeight * (requestedSize / token.fontSize));
}

export function text(token: TypeToken, extra?: TextStyle): TextStyle {
  const style: TextStyle = {
    ...token,
    ...extra,
    lineHeight: scaledLineHeight(token, extra),
  };
  // Resolved from the *merged* weight, not the token's. A caller overriding fontWeight was
  // otherwise given the token's family and a weight the platform couldn't apply to it: on
  // Android the loaded family wins outright, and on web the browser synthesises a fake bold
  // over the wrong file. Either way the text came out a weight nobody asked for.
  //
  // Relieved first, so a component's inline `fontWeight: "800"` is lightened along with the
  // tokens — see WEIGHT_RELIEF. Both the weight and the family have to move together, or the
  // browser synthesises the difference and the text comes out smeared.
  style.fontWeight = relieved(style.fontWeight);
  style.fontFamily = FAMILY_BY_WEIGHT[String(style.fontWeight)] ?? font.semiBold;

  if (FONT_SCALE_CORRECTION !== 1) {
    if (typeof style.fontSize === "number") style.fontSize *= FONT_SCALE_CORRECTION;
    // Explicit line heights have to move with the text, or capped type sits in gaps sized
    // for the uncapped version.
    if (typeof style.lineHeight === "number") style.lineHeight *= FONT_SCALE_CORRECTION;
  }

  return style;
}

/**
 * Type at exactly the size the design draws it — everything above, minus TYPE_SCALE's trim.
 *
 * The trim exists because the earlier screens were drawn at a comfortable desktop scale and came
 * out too big on a phone. Home and the tab bar are transcribed from the Docked Ferne screens,
 * which are drawn at a phone's own size (a 375×812 frame) with the capture hero gone, so taking
 * another 10% off would make them smaller than the design asks for rather than right.
 *
 * The OS text-size cap still applies: someone who has asked for larger text still gets it.
 * Use this only for surfaces transcribed from those screens; everything else goes through text().
 */
export function textAtDesignSize(token: TypeToken, extra?: TextStyle): TextStyle {
  const style: TextStyle = {
    ...token,
    ...extra,
    // Same lineHeight/fontSize mismatch text() guards against — see scaledLineHeight.
    lineHeight: scaledLineHeight(token, extra),
  };
  // Same merged-weight resolution and same relief as text() above — see the notes there.
  style.fontWeight = relieved(style.fontWeight);
  style.fontFamily = FAMILY_BY_WEIGHT[String(style.fontWeight)] ?? font.semiBold;

  if (OS_FONT_CAP !== 1) {
    if (typeof style.fontSize === "number") style.fontSize *= OS_FONT_CAP;
    if (typeof style.lineHeight === "number") style.lineHeight *= OS_FONT_CAP;
  }

  return style;
}

/**
 * Vertical rhythm, trimmed alongside TYPE_SCALE. `gutter` is deliberately left at 20 —
 * it's the screen's horizontal margin, which has no bearing on how many rows fit and
 * narrowing it would make the content look cramped against the edges.
 */
/**
 * Vertical rhythm, on the same grid as the type — see `gridded`. On a phone whose Display size
 * has been turned up these shrink alongside the text, so rows get shorter rather than just
 * holding smaller writing in the same tall box.
 */
export const space = {
  xs: gridded(3),
  sm: gridded(7),
  md: gridded(9),
  base: gridded(10),
  card: gridded(13),
  gutter: gridded(20),
  lg: gridded(20),
} as const;

export const radius = {
  /** The final screens' card and sheet corners — 16, where the older surfaces use 12. */
  panel: 16,
  /** Their chips, pinned buttons and inset pills. */
  chip: 14,
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
/**
 * Fixed dimensions, on the same grid as the type and spacing — see `gridded`.
 *
 * `minTouch` is deliberately *not* scaled. It's the smallest a tappable target may be before
 * people start missing it, which is a property of fingers rather than of the screen; shrinking
 * it on a compressed grid would make the hardest-to-use phones harder still. Everything else
 * here is visual and scales.
 */
export const size = {
  /** Accessibility floor — never scaled. Both platforms put the minimum at ~44dp. */
  minTouch: 44,
  /**
   * How far the docked capture disc rises above the tab bar (DockedTabBar's CAPTURE_LIFT of 40,
   * plus the 5px glow ring around it, plus a hair). Anything pinned to the bottom of a *tab*
   * screen has to clear this or the disc sits on top of it.
   */
  dockRise: gridded(46),
  button: gridded(46),
  toggleW: gridded(44),
  toggleH: gridded(26),
  toggleKnob: gridded(20),
  icon: gridded(19), // in-row icon marks
  iconLg: gridded(22), // standalone icon in a card
  iconInline: gridded(16), // inside a text run — use the 2-shape variant
  ferne: gridded(46),
} as const;

/**
 * A one-off dimension, put on the layout grid.
 *
 * For sizes that are genuinely specific to one component and don't belong in the shared `size`
 * scale above — a particular disc, a stepper button, a progress bar's height. Writing the number
 * inline is fine; leaving it *unscaled* is not, because on a compressed grid it keeps its
 * original size while everything around it shrinks, and the proportions drift.
 *
 * Hairlines are left alone: `px(1)` is still 1, because a divider is meant to be the thinnest
 * line the screen can draw rather than a scaled quantity.
 */
export function px(value: number): number {
  if (value <= 1) return value;
  // Never round a real dimension away to nothing.
  return Math.max(1, Math.round(value * GRID_SCALE));
}

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


/**
 * The Scheduled screen's three panels.
 *
 * Overdue is the only one that carries a tint of its own — a warm blush field that makes
 * "you're behind on these" visible before a single word is read, without resorting to the
 * alarm-red `danger` tokens, which in this app mean destructive actions rather than
 * lateness. Recurring and Upcoming are deliberately calm by comparison: routines and
 * future plans are not problems to be solved.
 *
 * Grouped here rather than inlined on the screen because these are surface tokens like any
 * other — a second screen showing an overdue panel should reach for the same field, not
 * re-pick a similar one by eye.
 */


/**
 * Home's own surface, transcribed from the Docked Ferne screens (9a / 9b).
 *
 * Grouped here rather than left as literals on the screen for the same reason schedulePanel is:
 * these are tokens like any other, and a second screen showing a finished row should reach for
 * the same cream rather than re-pick a similar one by eye.
 */


/**
 * Task Detail's surface, transcribed from the Task Detail Elegant screens.
 *
 * A warmer, quieter register than the rest of the app: a deeper ink (#1C2422 rather than
 * `text`), a terracotta that leans brown (#A2604A rather than `interactive`), soft white cards
 * on big 22pt radii with a single hairline shadow instead of the lifted, gradient-filled
 * surfaces Home uses. Grouped rather than inlined for the same reason `home` and
 * `schedulePanel` are — a second screen showing one of these cards should reach for the same
 * values rather than re-pick them by eye.
 */


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

/** A colour's hue, saturation and lightness — lightness in points, so 67.6 rather than 0.676. */
function toHsl(hex: string): { h: number; s: number; l: number } {
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

  return { h, s, l: l * 100 };
}

function fromHsl(h: number, s: number, lightness: number): string {
  const l = Math.min(1, Math.max(0, lightness / 100));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];

  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** The same colour at a given alpha — for a fade that has to end in the screen's own ground. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Shifts a colour's HSL lightness by `delta` (in points, so 8 means +8%), leaving hue and
 * saturation alone. A straight blend toward white/black desaturates as it goes and turns
 * the goal accents chalky; moving lightness keeps them the same colour, only lit
 * differently.
 */
export function shade(hex: string, delta: number): string {
  const { h, s, l } = toHsl(hex);
  return fromHsl(h, s, l + delta);
}

/**
 * The same colour lit to a fixed lightness, rather than shifted by a step.
 *
 * The goal ring's groove needs one: the design's two examples sit at 94.9% and 92.9% lightness
 * whatever they started from (a blue at 67.6% and a green at 50.6%), so a step would leave a
 * dark goal colour's groove far too dark to read as an empty track.
 */
export function atLightness(hex: string, lightness: number): string {
  const { h, s } = toHsl(hex);
  return fromHsl(h, s, lightness);
}

/**
 * A goal's ring, from the goal's own colour: the pale groove behind it, and the darker ink the
 * percentage is written in. Measured off the design's two goals — the blue #8DA6CC draws
 * #EDF1F7 / #4C6B99, the olive #A4BF43 draws #F0F4E6 / #5F7226 — and derived rather than listed,
 * since the colour is the user's to pick.
 */
export function goalRing(hex: string): { track: string; ink: string } {
  return {
    track: atLightness(hex, light.goalRing.trackLightness),
    ink: shade(hex, light.goalRing.inkShift),
  };
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
