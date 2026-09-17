import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View, type BoxShadowValue } from "react-native";
import Svg, {
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { color } from "../theme";
import { useReduceMotion } from "./Ferne";

/**
 * The app's background wash — transcribed from the design's layered CSS gradients.
 *
 * Five stacked fields: a violet-to-white diagonal ramp across the whole screen, a violet
 * bloom off the top-right, a terracotta one off the bottom-left, a small olive one on the
 * right, and a white lift in the top-left corner. A closing overlay brightens the top and
 * warms the very bottom.
 *
 * The design blurs each blob 14–18px. Nothing here does: the gradients are already soft
 * enough that a blur is invisible, and react-native-svg's filter support is uneven across
 * platforms — an effect that silently doesn't apply on one of them is worse than none.
 *
 * Offsets are the design's own pixel values, anchored to the edges they were measured
 * from, so they hold their corner on any screen size rather than drifting with width.
 *
 * Mounted once by ScreenContainer rather than per screen, so every screen sits on the same
 * field and the colours don't shift as the user moves between tabs.
 */
/**
 * Resolves one of the design's blobs — a square div, offset from a screen edge, holding a
 * `radial-gradient(circle at x% y%, …)` — into a centre and radius in screen pixels.
 *
 * Two things the CSS says that the previous transcription didn't carry over:
 *
 * A gradient with no explicit extent runs to its *farthest corner*, not to half the box.
 * Drawn at `r="50%"` every bloom fell off to nothing about half-way out, which is what made
 * the wash read as four small tight spots instead of as light filling the room.
 *
 * And the div's `border-radius:50%` clip is not really part of the look. The design blurs
 * each blob 14–18px, and what that blur is mostly doing is hiding the hard circular edge
 * where the clip cuts the gradient off. Since every one of these fades to fully transparent
 * on its own (the last stop is alpha 0, at 70–76% of the radius), painting it unclipped
 * across the whole screen gives the same soft bloom with no edge to hide — and needs no SVG
 * filter, whose support is uneven enough across platforms that an effect silently missing
 * on one of them would be worse than none.
 */
function bloom(box: number, cxPct: number, cyPct: number, left: number, top: number) {
  return {
    cx: left + box * cxPct,
    cy: top + box * cyPct,
    r: box * Math.hypot(Math.max(cxPct, 1 - cxPct), Math.max(cyPct, 1 - cyPct)),
  };
}

/** CSS gradient angle (clockwise from "to top") → the line's endpoints across a W×H box. */
function cssLinearEndpoints(angleDeg: number, w: number, h: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  // CSS sizes the gradient line so its ends reach the corners of the box.
  const len = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
  return {
    x1: w / 2 - (dx * len) / 2,
    y1: h / 2 - (dy * len) / 2,
    x2: w / 2 + (dx * len) / 2,
    y2: h / 2 + (dy * len) / 2,
  };
}

/**
 * Two versions of the same field.
 *
 * "ambient" is what every screen has had: the five layers plus a closing overlay that brightens
 * the top and warms the bottom. "home" is the Docked Ferne screens' own wash — the same five
 * layers with no closing overlay, and with the three colour blooms drifting the way the design
 * animates them. The drift is confined to Home on purpose: the handoff rules out looping ambient
 * motion everywhere else, and a focus session is the last place that should have any.
 */
export type WashVariant = "ambient" | "home";

/** The design's three drifting blooms: seconds per cycle, and where each one travels to. */
const DRIFT = {
  violet: { duration: 23_000, x: 26, y: -34, scale: 1.12 },
  terra: { duration: 29_000, x: -30, y: 26, scale: 1.08 },
  olive: { duration: 34_000, x: -16, y: 20, rotate: 9 },
} as const;

/** CSS `ease-in-out` there and back, on the native driver. */
function useDrift(durationMs: number, enabled: boolean) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      v.setValue(0);
      return;
    }
    const half = { duration: durationMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true };
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, ...half }),
        Animated.timing(v, { toValue: 0, ...half }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [durationMs, enabled, v]);
  return v;
}

export function ScreenWash({ variant = "ambient" }: { variant?: WashVariant }) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const drifting = variant === "home" && !reduceMotion;
  const violetDrift = useDrift(DRIFT.violet.duration, drifting);
  const terraDrift = useDrift(DRIFT.terra.duration, drifting);
  const oliveDrift = useDrift(DRIFT.olive.duration, drifting);

  const VIOLET = "#8B5CF6";
  const TERRA = "#DF6D41";
  const OLIVE = "#A4BF43";

  // In user space rather than objectBoundingBox: bbox units are fractions of a 375×812
  // rectangle, which shears a 158° vector into a much steeper one and stretches the stop
  // spacing with the screen's aspect ratio. Pixels keep the angle the design drew.
  const ramp = cssLinearEndpoints(158, width, height);

  // Design offsets, kept as the edge each was measured from so every bloom holds its own
  // corner on any screen size rather than drifting with the width.
  const violet = bloom(320, 0.38, 0.34, width + 104 - 320, -96);
  const terra = bloom(340, 0.6, 0.4, -118, height + 84 - 340);
  const olive = bloom(220, 0.46, 0.5, 250, 300);
  const lift = bloom(280, 0.42, 0.4, -40, -40);

  /**
   * A bloom on its own layer, so it can move. Each fills the screen and is shaped entirely by
   * its own gradient; the transform is applied to the layer, around the bloom's own centre
   * rather than the screen's, which is what the design scales and rotates about.
   */
  const bloomLayer = (
    id: string,
    at: { cx: number; cy: number },
    progress: Animated.Value,
    motion: { x: number; y: number; scale?: number; rotate?: number },
    stops: React.ReactNode
  ) => (
    <Animated.View
      key={id}
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          transformOrigin: [at.cx, at.cy, 0],
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, motion.x] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, motion.y] }) },
            ...(motion.scale
              ? [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, motion.scale] }) }]
              : []),
            ...(motion.rotate
              ? [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${motion.rotate}deg`] }) }]
              : []),
          ],
        },
      ]}
    >
      <Svg width={width} height={height}>
        <Defs>{stops}</Defs>
        <Rect width={width} height={height} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );

  return (
    // Clipped, not just positioned. The drifting blooms are full-screen layers that translate
    // and scale by up to ~30px, so without this they hang past the right edge — which on web
    // makes the whole document wider than the screen and lets every screen scroll sideways.
    // The symptom is everything looking shifted and cut off, nowhere near the wash itself.
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="wRamp" gradientUnits="userSpaceOnUse" {...ramp}>
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.72} />
            <Stop offset="0.34" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.74" stopColor={VIOLET} stopOpacity={0.05} />
            <Stop offset="1" stopColor={VIOLET} stopOpacity={0.11} />
          </SvgLinearGradient>
        </Defs>

        <Rect width={width} height={height} fill={color.screen} />
        <Rect width={width} height={height} fill="url(#wRamp)" />
      </Svg>

      {/* Each bloom fills the screen and is shaped entirely by its own gradient — see
          `bloom()` for why they aren't clipped to circles the way the design's divs are. */}
      {bloomLayer(
        "wViolet",
        violet,
        violetDrift,
        DRIFT.violet,
        <RadialGradient id="wViolet" gradientUnits="userSpaceOnUse" {...violet}>
          <Stop offset="0" stopColor={VIOLET} stopOpacity={0.3} />
          <Stop offset="0.56" stopColor={VIOLET} stopOpacity={0.06} />
          <Stop offset="0.74" stopColor={VIOLET} stopOpacity={0} />
        </RadialGradient>
      )}
      {bloomLayer(
        "wTerra",
        terra,
        terraDrift,
        DRIFT.terra,
        <RadialGradient id="wTerra" gradientUnits="userSpaceOnUse" {...terra}>
          <Stop offset="0" stopColor={TERRA} stopOpacity={0.24} />
          <Stop offset="0.58" stopColor={TERRA} stopOpacity={0.05} />
          <Stop offset="0.76" stopColor={TERRA} stopOpacity={0} />
        </RadialGradient>
      )}
      {bloomLayer(
        "wOlive",
        olive,
        oliveDrift,
        DRIFT.olive,
        <RadialGradient id="wOlive" gradientUnits="userSpaceOnUse" {...olive}>
          <Stop offset="0" stopColor={OLIVE} stopOpacity={0.16} />
          <Stop offset="0.7" stopColor={OLIVE} stopOpacity={0} />
        </RadialGradient>
      )}

      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="wLiftTop" gradientUnits="userSpaceOnUse" {...lift}>
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
            <Stop offset="0.62" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          {/* Ellipses rather than a radius on a full-screen Rect — 120%×78% and 130%×62% of the
              screen — so each gradient stays a plain centred circle in its own (elliptical) box.
              On a Rect, SVG normalises against the box diagonal and the shape comes out neither
              the right height nor the right width. */}
          <RadialGradient id="wTopField" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} />
            <Stop offset="0.46" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="wFootField" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#8B6D4A" stopOpacity={0.13} />
            <Stop offset="0.58" stopColor="#8B6D4A" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect width={width} height={height} fill="url(#wLiftTop)" />

        {/* The design's Home screens stop here. The closing overlay below belongs to the older
            screens the rest of the app is drawn from — brightening the top and warming the very
            bottom — and Home leaves it off rather than sitting under a wash it wasn't drawn with. */}
        {variant === "ambient" ? (
          <>
            {/* 120% 78% at 50% 8% */}
            <Ellipse cx={width / 2} cy={height * 0.08} rx={width * 1.2} ry={height * 0.78} fill="url(#wTopField)" />
            {/* 130% 62% at 50% 106% */}
            <Ellipse cx={width / 2} cy={height * 1.06} rx={width * 1.3} ry={height * 0.62} fill="url(#wFootField)" />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

/**
 * Paints a linear gradient behind whatever it's dropped into.
 *
 * Backed by expo-linear-gradient rather than SVG. The SVG version this replaces had two
 * real defects, both of which showed on web as well as Android: every instance declared
 * its gradient with the same hardcoded `id="g"`, so several on one screen collided and
 * resolved to whichever was defined last; and an <Svg> laid out with absoluteFill has no
 * intrinsic size, so a `<Rect width="100%">` inside it had no viewport to resolve against
 * and rendered at the wrong box. A native gradient has neither problem — no id namespace
 * to collide in, and it sizes from layout.
 *
 * Corners are clipped one of two ways. By default the parent does it, with
 * `overflow: "hidden"` and its own border radius. Pass `radius` instead when the parent
 * can't — a surface that carries its own drop shadow must not set `overflow: "hidden"`,
 * since the clip that rounds the gradient would cut the shadow off too — and the gradient
 * rounds itself: expo-linear-gradient reads `borderRadius` off its own style and clips the
 * gradient path to it natively.
 */
export function GradientFill({
  colors,
  angle = 168,
  radius,
}: {
  colors: readonly { readonly offset: number; readonly color: string }[];
  angle?: number;
  radius?: number;
}) {
  /**
   * expo-linear-gradient takes `start`/`end` as fractions of the box and then multiplies
   * them straight back out by width and height — on all three platforms — so a vector that
   * is 168° in unit space arrives at some entirely different angle once the box isn't
   * square. On a stat chip (roughly 113×31) the design's near-vertical ramp was landing at
   * about 38° off vertical, raking across the chip instead of lighting it from above.
   *
   * Measuring the box and solving for the endpoints in pixels first is what pins the
   * rendered angle to the one the design asks for. Until the first layout arrives the
   * square-box answer stands in, which is the correct result for a square and a close one
   * for anything else.
   */
  const [box, setBox] = React.useState({ w: 1, h: 1 });
  const e = cssLinearEndpoints(angle, box.w, box.h);

  return (
    <LinearGradient
      colors={colors.map((c) => c.color) as [string, string, ...string[]]}
      locations={colors.map((c) => c.offset) as [number, number, ...number[]]}
      start={{ x: e.x1 / box.w, y: e.y1 / box.h }}
      end={{ x: e.x2 / box.w, y: e.y2 / box.h }}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        // Zero-sized boxes happen mid-layout and would divide the endpoints by nothing.
        if (width <= 0 || height <= 0) return;
        setBox((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
      style={radius != null ? [StyleSheet.absoluteFill, { borderRadius: radius }] : StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

/**
 * The design's inset rim-and-floor shading, painted as its own layer.
 *
 * It can't ride on the surface's own View. RN paints an inset box-shadow above the
 * background but below children — and on a gradient surface the gradient *is* a child
 * (expo-linear-gradient renders a native view rather than setting a background), so an
 * inset declared on the box would be buried under the very gradient it exists to shade.
 * Sitting between the two as a sibling restores CSS's order: gradient, then shading, then
 * content.
 *
 * `radius` should be the surface's radius less its border width, since an absolutely
 * positioned child is laid out inside the border.
 */
export function InnerShading({ shadows, radius }: { shadows: BoxShadowValue[]; radius: number }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, boxShadow: shadows }]} />;
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
});
