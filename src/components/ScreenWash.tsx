import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { color } from "../theme";

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
export function ScreenWash() {
  const { width, height } = useWindowDimensions();

  const VIOLET = "#8B5CF6";
  const TERRA = "#DF6D41";
  const OLIVE = "#A4BF43";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* 158deg in CSS ≈ this vector in objectBoundingBox space. */}
          <SvgLinearGradient id="wRamp" x1="0.31" y1="0.04" x2="0.69" y2="0.96">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.72} />
            <Stop offset="0.34" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.74" stopColor={VIOLET} stopOpacity={0.05} />
            <Stop offset="1" stopColor={VIOLET} stopOpacity={0.11} />
          </SvgLinearGradient>

          <RadialGradient id="wViolet" cx="38%" cy="34%" r="50%">
            <Stop offset="0" stopColor={VIOLET} stopOpacity={0.3} />
            <Stop offset="0.56" stopColor={VIOLET} stopOpacity={0.06} />
            <Stop offset="0.74" stopColor={VIOLET} stopOpacity={0} />
          </RadialGradient>

          <RadialGradient id="wTerra" cx="60%" cy="40%" r="50%">
            <Stop offset="0" stopColor={TERRA} stopOpacity={0.24} />
            <Stop offset="0.58" stopColor={TERRA} stopOpacity={0.05} />
            <Stop offset="0.76" stopColor={TERRA} stopOpacity={0} />
          </RadialGradient>

          <RadialGradient id="wOlive" cx="46%" cy="50%" r="50%">
            <Stop offset="0" stopColor={OLIVE} stopOpacity={0.16} />
            <Stop offset="0.7" stopColor={OLIVE} stopOpacity={0} />
          </RadialGradient>

          <RadialGradient id="wLift" cx="42%" cy="40%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
            <Stop offset="0.62" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>

          <RadialGradient id="wTop" cx="50%" cy="8%" r="78%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} />
            <Stop offset="0.46" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>

          <RadialGradient id="wFoot" cx="50%" cy="106%" r="62%">
            <Stop offset="0" stopColor="#8B6D4A" stopOpacity={0.13} />
            <Stop offset="0.58" stopColor="#8B6D4A" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect width={width} height={height} fill={color.screen} />
        <Rect width={width} height={height} fill="url(#wRamp)" />

        {/* top-right violet: design places it at top -96, right -104, 320 square */}
        <Circle cx={width + 104 - 160} cy={-96 + 160} r={160} fill="url(#wViolet)" />
        {/* bottom-left terracotta: bottom -84, left -118, 340 square */}
        <Circle cx={-118 + 170} cy={height + 84 - 170} r={170} fill="url(#wTerra)" />
        {/* mid-right olive: top 300, left 250, 220 square */}
        <Circle cx={250 + 110} cy={300 + 110} r={110} fill="url(#wOlive)" />
        {/* top-left white lift: top -40, left -40, 280 square */}
        <Circle cx={-40 + 140} cy={-40 + 140} r={140} fill="url(#wLift)" />

        <Rect width={width} height={height} fill="url(#wTop)" />
        <Rect width={width} height={height} fill="url(#wFoot)" />
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
 * The parent must set `overflow: "hidden"` and its own border radius — this fills the
 * whole box and relies on the parent to clip its corners.
 */
export function GradientFill({ colors, angle = 168 }: { colors: { offset: number; color: string }[]; angle?: number }) {
  // CSS gradient angles run clockwise from "to top"; expo-linear-gradient takes start/end
  // points in unit square coordinates, so centre the vector on the box.
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;

  return (
    <LinearGradient
      colors={colors.map((c) => c.color) as [string, string, ...string[]]}
      locations={colors.map((c) => c.offset) as [number, number, ...number[]]}
      start={{ x: 0.5 - dx, y: 0.5 - dy }}
      end={{ x: 0.5 + dx, y: 0.5 + dy }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}
