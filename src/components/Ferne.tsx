/**
 * Ferne — the FOYG companion.
 *
 * Pure geometry (circles and arcs) rather than image assets, so one file stays crisp from
 * the 24px tab icon to the 512px store icon, themes from the palette, and animates with no
 * PNGs to keep in sync. Do not export bitmaps for this.
 *
 * How the motion works: the figure is four stacked <Svg> layers (ears behind, body,
 * muzzle + eyes in front), each inside its own Animated.View. Animating the wrapper Views
 * rather than SVG nodes keeps every frame on the native driver — no JS-thread work while a
 * focus session is running, which is the one place in this app where a dropped frame would
 * be felt.
 */

import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { color, radius, size as sizeToken, space, text as t, type as T } from "../theme";

/**
 * Ferne's own shades. Five of the eight are ordinary theme tokens under another name —
 * spelled out here so the drawing code reads as a character sheet rather than as UI, while
 * still having exactly one definition per colour.
 */
const P = {
  terracotta: color.ferne,
  terracottaLight: color.ferneLight,
  terracottaPale: color.fernePale,
  terracottaDeep: color.ferneDeep,
  buttercream: color.screen,
  ink: color.text,
  slate: color.textMuted,
  goalBlue: color.goal,
} as const;

/**
 * Six states, one per thing the app can be doing. `asleep` is the important one: it has to
 * recede rather than perform, because it shows while the user is trying to concentrate.
 */
export type FerneState = "idle" | "listening" | "sorting" | "asleep" | "celebrate" | "nudge";

interface FerneProps {
  size?: number;
  state?: FerneState;
  /** Force motion off. Reduce Motion is already honoured without this. */
  animate?: boolean;
  /** Speech bubble to Ferne's right. Omit for a bare character. */
  message?: string;
}

/* ------------------------------------------------------------------ helpers */

/**
 * Mirrors the OS "Reduce Motion" setting. The handoff lists this as a requirement rather
 * than a nicety, and Ferne is the first thing in the app that moves on its own, so the
 * hook lands here with her.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Continuous ease-in-out loop, 0 → 1 → 0. Native driver. */
function useLoop(durationMs: number, enabled: boolean) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      v.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: durationMs / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: durationMs / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [durationMs, enabled, v]);
  return v;
}

/** Mostly-still value that fires a short pulse once per period (blink, ear twitch). */
function usePulse(periodMs: number, pulseMs: number, enabled: boolean) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      v.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(periodMs - pulseMs),
        Animated.timing(v, {
          toValue: 1,
          duration: pulseMs * 0.4,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: pulseMs * 0.6,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [periodMs, pulseMs, enabled, v]);
  return v;
}

/* -------------------------------------------------------------------- Ferne */

export function Ferne({ size = sizeToken.ferne, state = "idle", animate = true, message }: FerneProps) {
  const reduceMotion = useReduceMotion();
  const asleep = state === "asleep";
  // Three ways to be still: the state is asleep, the caller said so, or the OS asked.
  const moving = animate && !asleep && !reduceMotion;

  // Deliberately mismatched periods — nothing lines up, so she never looks mechanical.
  const float = useLoop(7000, moving);
  const blink = usePulse(8400, 260, moving);
  const earL = usePulse(6400, 300, moving);
  const earR = usePulse(7100, 300, moving);
  const nose = usePulse(5400, 220, moving);

  const pose = POSES[state];
  const u = size / 200; // viewBox unit → px, so one set of numbers works at any size

  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -7 * u] });
  const shadowScale = float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.89] });
  const shadowOpacity = float.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.15] });
  const eyeScaleY = blink.interpolate({ inputRange: [0, 1], outputRange: [1, 0.12] });
  const earLrot = earL.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-8deg"] });
  const earRrot = earR.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "7deg"] });
  const noseScale = nose.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });

  const layer = { position: "absolute" as const, left: 0, top: 0, width: size, height: size };

  const character = (
    /**
     * flexGrow/flexShrink/flexBasis pinned, not just width/height: the handoff calls out a
     * real bug from the web build where a flex row stretched Ferne into an oval. RN
     * defaults flexShrink to 0, but flexBasis is what stops a row from squeezing her.
     */
    <View
      style={{ width: size, height: size, flexGrow: 0, flexShrink: 0, flexBasis: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={ACCESSIBILITY_LABEL[state]}
    >
      {/* ground shadow — flexes as she rises, so she reads as having mass */}
      <Animated.View
        style={[layer, { opacity: asleep ? 0.07 : shadowOpacity, transform: [{ scaleX: asleep ? 1 : shadowScale }] }]}
        pointerEvents="none"
      >
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Ellipse cx="100" cy="184" rx="46" ry="7" fill={P.terracottaDeep} />
        </Svg>
      </Animated.View>

      {/* everything above the ground floats together */}
      <Animated.View style={[layer, { transform: [{ translateY: asleep ? 0 : floatY }] }]} pointerEvents="none">
        {/* ears, behind the head */}
        <Animated.View style={[layer, { transform: [{ rotate: asleep ? "0deg" : earLrot }] }]}>
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <Defs>
              {/* The design lights each ear from the top rather than filling it flat — the
                  only thing giving a 17-wide rounded bar any roundness at all. */}
              <SvgLinearGradient id="fEarL" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#EB8A5F" />
                <Stop offset="1" stopColor={P.terracotta} />
              </SvgLinearGradient>
            </Defs>
            <G opacity={pose.dim}>
              <Rect x="70" y={pose.earTop} width="17" height={pose.earLen} rx="8.5" fill="url(#fEarL)" />
              <Rect
                x="74.5"
                y={pose.earTop + 8}
                width="8"
                height={pose.earLen - 18}
                rx="4"
                fill={P.terracottaPale}
                opacity={0.6}
              />
            </G>
          </Svg>
        </Animated.View>
        <Animated.View style={[layer, { transform: [{ rotate: asleep ? "0deg" : earRrot }] }]}>
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <Defs>
              <SvgLinearGradient id="fEarR" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#EB8A5F" />
                <Stop offset="1" stopColor={P.terracotta} />
              </SvgLinearGradient>
            </Defs>
            <G opacity={pose.dim}>
              <Rect x="113" y={pose.earTop} width="17" height={pose.earLen} rx="8.5" fill="url(#fEarR)" />
              <Rect
                x="117.5"
                y={pose.earTop + 8}
                width="8"
                height={pose.earLen - 18}
                rx="4"
                fill={P.terracottaPale}
                opacity={0.6}
              />
            </G>
          </Svg>
        </Animated.View>

        {/* body + head + spectacles */}
        <View style={layer}>
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <Defs>
              <RadialGradient id="fBody" cx="33%" cy="20%" r="88%">
                <Stop offset="0" stopColor={asleep ? P.terracottaPale : "#F5B694"} />
                <Stop offset="0.5" stopColor={asleep ? "#E7B79A" : P.terracotta} />
                <Stop offset="1" stopColor={asleep ? "#D9A183" : P.terracottaDeep} />
              </RadialGradient>
              <RadialGradient id="fMuzzle" cx="42%" cy="26%" r="84%">
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="0.62" stopColor={P.buttercream} />
                <Stop offset="1" stopColor={P.terracottaPale} />
              </RadialGradient>
            </Defs>

            <G opacity={pose.dim}>
              <Ellipse cx="100" cy="152" rx="42" ry="32" fill="url(#fBody)" />
              <Ellipse cx="100" cy="160" rx="24" ry="19" fill="#F7D9C4" opacity={0.55} />
              <Circle cx="100" cy="104" r="46" fill="url(#fBody)" />
              {!asleep && (
                <Path
                  d="M64 84 A 46 46 0 0 1 96 60"
                  stroke={P.terracottaPale}
                  strokeWidth={5}
                  strokeLinecap="round"
                  opacity={0.45}
                  fill="none"
                />
              )}
              <Ellipse cx="100" cy="122" rx="26" ry="20" fill="url(#fMuzzle)" />

              {/* spectacles — the brand mark's linework, carried on the face */}
              <G stroke={P.terracottaDeep} strokeWidth={3.4} fill="none" strokeLinecap="round">
                <Circle cx="82" cy="99" r="15" fill={P.buttercream} fillOpacity={0.92} />
                <Circle cx="118" cy="99" r="15" fill={P.buttercream} fillOpacity={0.92} />
                <Path d="M97 99 L 103 99" />
                <Path d="M67 96 L 56 92" />
                <Path d="M133 96 L 144 92" />
              </G>
            </G>
          </Svg>
        </View>

        {/* nose — flexes on its own cycle so she never looks mechanical */}
        <Animated.View style={[layer, { transform: [{ scale: asleep ? 1 : noseScale }] }]}>
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <G opacity={pose.dim}>
              <Path d="M95 115 L 105 115 L 100 121 Z" fill={P.terracottaDeep} />
              <Path d="M100 121 L 100 128" stroke="#B98567" strokeWidth={2.4} strokeLinecap="round" />
            </G>
          </Svg>
        </Animated.View>

        {/* eyes — the only part that changes per state */}
        <Animated.View style={[layer, { transform: [{ scaleY: asleep ? 1 : eyeScaleY }] }]}>
          <Svg width={size} height={size} viewBox="0 0 200 200">
            {asleep ? (
              <G stroke="#B98567" strokeWidth={3.4} strokeLinecap="round" fill="none" opacity={pose.dim}>
                <Path d="M74 99 Q 82 106 90 99" />
                <Path d="M110 99 Q 118 106 126 99" />
              </G>
            ) : (
              <G>
                <Ellipse cx="82" cy={pose.eyeY} rx={pose.eyeR} ry={pose.eyeR * pose.eyeSquash} fill={P.ink} />
                <Ellipse cx="118" cy={pose.eyeY} rx={pose.eyeR} ry={pose.eyeR * pose.eyeSquash} fill={P.ink} />
                <Circle
                  cx={82 - pose.eyeR * 0.38}
                  cy={pose.eyeY - pose.eyeR * 0.42}
                  r={pose.eyeR * 0.34}
                  fill="#FFFFFF"
                  opacity={0.92}
                />
                <Circle
                  cx={118 - pose.eyeR * 0.38}
                  cy={pose.eyeY - pose.eyeR * 0.42}
                  r={pose.eyeR * 0.34}
                  fill="#FFFFFF"
                  opacity={0.92}
                />
              </G>
            )}
          </Svg>
        </Animated.View>

        {/* Glass, last of all — the design draws these two arcs over the eyes, not under
            them, which is what makes the lenses read as something the pupils sit behind.
            Outside the blink wrapper on purpose: a highlight on the glass shouldn't squash
            when the eye behind it closes. */}
        <View style={layer} pointerEvents="none">
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <G stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.5 * pose.dim}>
              <Path d="M76 88 A 15 15 0 0 1 88 84" />
              <Path d="M112 88 A 15 15 0 0 1 124 84" />
            </G>
          </Svg>
        </View>
      </Animated.View>
    </View>
  );

  if (!message) return character;

  return (
    <View style={styles.withMessage}>
      {character}
      <View style={styles.bubble}>
        <Text style={t(T.meta, { color: color.textBody, lineHeight: 19 })}>{message}</Text>
      </View>
    </View>
  );
}

/**
 * State poses. Only six numbers change between states — that's deliberate: one
 * construction, six readings.
 *
 * idle       eyes neutral, ears up, full float
 * listening  eyes widen 20%, ears raised, leaning in
 * sorting    eyes ride higher (looking up, thinking)
 * asleep     eyes closed to arcs, ears lowered, motion off, colour dropped
 * celebrate  eyes squash to a delighted arc, ears at full stretch
 * nudge      eyes slightly narrowed and low — warm, never disappointed
 */
const POSES: Record<
  FerneState,
  { eyeY: number; eyeR: number; eyeSquash: number; earTop: number; earLen: number; dim: number }
> = {
  idle: { eyeY: 100, eyeR: 6.5, eyeSquash: 1.0, earTop: 10, earLen: 66, dim: 1 },
  listening: { eyeY: 99, eyeR: 8.0, eyeSquash: 1.05, earTop: 6, earLen: 70, dim: 1 },
  sorting: { eyeY: 96, eyeR: 6.5, eyeSquash: 1.0, earTop: 8, earLen: 68, dim: 1 },
  asleep: { eyeY: 100, eyeR: 6.5, eyeSquash: 1.0, earTop: 24, earLen: 54, dim: 0.72 },
  celebrate: { eyeY: 98, eyeR: 7.5, eyeSquash: 0.72, earTop: 4, earLen: 72, dim: 1 },
  nudge: { eyeY: 102, eyeR: 6.0, eyeSquash: 0.85, earTop: 16, earLen: 62, dim: 1 },
};

/** Ferne carries meaning, so a screen reader gets the state rather than "image". */
const ACCESSIBILITY_LABEL: Record<FerneState, string> = {
  idle: "Ferne, resting",
  listening: "Ferne, listening",
  sorting: "Ferne, thinking",
  asleep: "Ferne, asleep while you focus",
  celebrate: "Ferne, celebrating",
  nudge: "Ferne, waiting for you",
};

/* --------------------------------------------------------------- tab icon */

/**
 * 24px build. Not a scaled-down Ferne: strokes thicken, pupils enlarge, and the spectacle
 * bridge is dropped because it fills in below 20px.
 */
export function FerneIcon({ size = 24, color: tint = P.terracotta }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Rect x="66" y="14" width="22" height="62" rx="11" fill={tint} />
      <Rect x="112" y="14" width="22" height="62" rx="11" fill={tint} />
      <Circle cx="100" cy="118" r="62" fill={tint} />
      <Circle cx="76" cy="112" r="20" fill={P.buttercream} />
      <Circle cx="124" cy="112" r="20" fill={P.buttercream} />
      <Circle cx="76" cy="112" r="9" fill={P.ink} />
      <Circle cx="124" cy="112" r="9" fill={P.ink} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  withMessage: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
  },
  bubble: {
    flex: 1,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
});
