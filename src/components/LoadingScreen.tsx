import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from "react-native-svg";
import * as SplashScreen from "expo-splash-screen";

import { useReduceMotion } from "./Ferne";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";

/**
 * The splash, as a real screen.
 *
 * Fills the same visual role as the native splash (app.json's expo-splash-screen config) but
 * for the one gap that config can't cover: an interactive sign-in. The native splash only
 * exists between process start and the first JS frame — once hidden, showing it again isn't
 * reliably possible on either platform, so a fresh sign-in's own prefetch (see SessionContext)
 * would otherwise leave Home rendering half-empty until each query resolves.
 *
 * It is also the only place the splash design can exist in full. A native splash is one image
 * masked to a circle on one flat colour: no ambient light, no wordmark, no progress. So the
 * two halves divide the design between them — the native one shows Ferne on the design's own
 * background, and this draws the rest around her the moment JS is running. Same artwork file
 * in both, so the handoff is the lockup resolving rather than a cut to something else.
 */

/**
 * The design's own palette for this screen, which is warmer than the app's own dark.
 *
 * Exported because the screen shown while a focus session starts (StartingFocus) is drawn on the
 * same ground - it is a moment of the same kind, waiting for the app rather than for the user.
 */
export const SPLASH_PALETTE = {
  light: {
    bg: "#FDF8EA",
    ring1: "#EDE0C6",
    ring2: "#F3EBDA",
    ink: "#1F2927",
    muted: "#5E5647",
    accent: "#B4562C",
    accentSoft: "#DF6D41",
    track: "#F0E7D4",
    glowViolet: "rgba(139,92,246,0.26)",
    glowTerra: "rgba(223,109,65,0.24)",
    stage: "rgba(223,109,65,0.18)",
    floor: "rgba(223,109,65,0.16)",
  },
  dark: {
    bg: "#1B1714",
    ring1: "#3A322A",
    ring2: "#2E2822",
    ink: "#F1E9D8",
    muted: "#A89D88",
    accent: "#E08356",
    accentSoft: "#D3703F",
    track: "#2E2822",
    glowViolet: "rgba(139,92,246,0.12)",
    glowTerra: "rgba(223,109,65,0.14)",
    stage: "rgba(223,109,65,0.20)",
    floor: "rgba(223,109,65,0.34)",
  },
} as const;

/**
 * The shape of one variant. Needed because `as const` narrows every value to its own literal,
 * so light and dark end up as two incompatible types and neither can be passed as "a palette".
 */
export type SplashPalette = { -readonly [K in keyof typeof SPLASH_PALETTE.light]: string };

/** Ferne's box in the design. The rings are sized from it, as they are in the CSS. */
const HERO = 210;
const RING_1 = 290;
const RING_2 = 410;

/**
 * The ambient light, as four radial washes.
 *
 * SVG rather than expo-linear-gradient, which only does linear — every glow in this design is
 * a radial, and faking one with a linear ramp is what makes a wash read as a band. Drawn as one
 * Svg behind everything so the whole atmosphere costs a single native view.
 */
function Atmosphere({ palette, width, height }: { palette: SplashPalette; width: number; height: number }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Defs>
        <RadialGradient id="violet" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={palette.glowViolet} />
          <Stop offset="0.56" stopColor={palette.glowViolet} stopOpacity={0.18} />
          <Stop offset="1" stopColor={palette.glowViolet} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="terra" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={palette.glowTerra} />
          <Stop offset="0.58" stopColor={palette.glowTerra} stopOpacity={0.2} />
          <Stop offset="1" stopColor={palette.glowTerra} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="stage" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={palette.stage} />
          <Stop offset="0.46" stopColor={palette.stage} stopOpacity={0.22} />
          <Stop offset="1" stopColor={palette.stage} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* top right, violet — the one cool note in an otherwise warm screen */}
      <Ellipse cx={width + 56} cy={-16} rx={190} ry={190} fill="url(#violet)" />
      {/* bottom left, terracotta */}
      <Ellipse cx={-60} cy={height + 20} rx={200} ry={200} fill="url(#terra)" />
      {/* behind Ferne, lifting her off the background */}
      <Ellipse cx={width / 2} cy={height * 0.44} rx={230} ry={230} fill="url(#stage)" />
      <Rect width={0} height={0} />
    </Svg>
  );
}

/** The soft pool Ferne stands in. Separate from the stage wash because it sits in front. */
function FloorGlow({ palette }: { palette: SplashPalette }) {
  return (
    <Svg width={240} height={48} style={styles.floor} pointerEvents="none">
      <Defs>
        <RadialGradient id="floor" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={palette.floor} />
          <Stop offset="0.5" stopColor={palette.floor} stopOpacity={0.25} />
          <Stop offset="1" stopColor={palette.floor} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={120} cy={24} rx={120} ry={24} fill="url(#floor)" />
    </Svg>
  );
}

export function LoadingScreen() {
  const theme = useTheme();
  const s = useThemedStyles(makeStyles);
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const palette = theme.mode === "dark" ? SPLASH_PALETTE.dark : SPLASH_PALETTE.light;

  /*
   * The loader's sweep. The only motion kept from the design: the rings breathe and Ferne
   * floats in the HTML, but this screen is up for a second or two at most and a character
   * that starts moving just as the screen is replaced reads as a glitch rather than as life.
   * A progress bar that moves is the one piece that has a job to do.
   */
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, sweep]);

  return (
    <View
      style={[s.screen, { backgroundColor: palette.bg }]}
      // The phone's own splash comes down the moment this one is drawn, not before - there is
      // no gap between them - and not after, which is how the full design went unseen.
      // Rejects harmlessly when there is nothing to hide (a sign-in later on, or the web).
      onLayout={() => {
        SplashScreen.hideAsync().catch(() => {});
      }}
    >
      <Atmosphere palette={palette} width={width} height={height} />

      <View style={s.spacerTop} />

      <View style={s.hero}>
        <View style={[s.ring, s.ring1, { borderColor: palette.ring1 }]} />
        <View style={[s.ring, s.ring2, { borderColor: palette.ring2 }]} />
        <FloorGlow palette={palette} />
        {/*
          The same file the native splash draws, so the two cannot drift. resizeMode contain
          rather than a fixed box: the artwork is square and already carries its own margin.
        */}
        <Image source={require("../../assets/splash.png")} style={s.ferne} resizeMode="contain" />
      </View>

      <Text style={[s.wordmark, { color: palette.ink }]}>
        foyg<Text style={{ color: palette.accentSoft }}>.</Text>
      </Text>

      <View style={s.acronym}>
        {[
          ["F", "ocus"],
          ["O", "n"],
          ["Y", "our"],
          ["G", "oals"],
        ].map(([initial, rest]) => (
          <Text key={initial} style={[s.acronymWord, { color: palette.muted }]}>
            <Text style={{ color: palette.accent }}>{initial}</Text>
            {rest.toUpperCase()}
          </Text>
        ))}
      </View>

      <Text style={[s.tagline, { color: palette.muted }]}>Your companion for phone-free focus.</Text>

      <View style={s.spacerBottom} />

      <View style={[s.loader, { backgroundColor: palette.track }]}>
        <Animated.View
          style={[
            s.loaderFill,
            {
              backgroundColor: palette.accentSoft,
              transform: [
                { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-32, 75] }) },
              ],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floor: { position: "absolute", bottom: -12, alignSelf: "center" },
});

const makeStyles = (_t: Tokens) =>
  StyleSheet.create({
    screen: { flex: 1, alignItems: "center" },
    spacerTop: { flex: 1 },
    spacerBottom: { flex: 1.25 },

    hero: { width: HERO, height: HERO, alignItems: "center", justifyContent: "center" },
    // Centred by its own negative offset rather than by a transform, which RN applies after
    // layout and would leave the ring measuring at the hero's top left for hit-testing.
    ring: { position: "absolute", borderWidth: 1, borderRadius: 999 },
    ring1: { width: RING_1, height: RING_1, top: (HERO - RING_1) / 2, left: (HERO - RING_1) / 2 },
    ring2: { width: RING_2, height: RING_2, top: (HERO - RING_2) / 2, left: (HERO - RING_2) / 2 },
    /*
     * Larger than the hero box it sits in, and deliberately so.
     *
     * The shared artwork is inscribed in the circle Android masks a splash icon to, which
     * leaves the figure filling only about 71% of the square - drawn at the hero's own 210 she
     * came out noticeably smaller than the design. 280 is the size at which the drawn rabbit
     * measures the ~198pt the design gives her. Nothing clips: RN only clips on overflow
     * hidden, and the hero sets none.
     */
    ferne: { position: "absolute", width: 280, height: 280 },

    wordmark: {
      marginTop: 34,
      fontFamily: "PlusJakartaSans_800ExtraBold",
      fontSize: 62,
      // -.055em of 62px. RN takes points, not em, so the design's ratio is resolved here.
      letterSpacing: -3.4,
      lineHeight: 62,
    },
    acronym: { marginTop: 14, flexDirection: "row", gap: 7 },
    acronymWord: {
      fontFamily: "PlusJakartaSans_800ExtraBold",
      fontSize: 12,
      letterSpacing: 2.4,
      lineHeight: 14,
    },
    tagline: {
      marginTop: 22,
      /*
       * 175, not the design's 250. The CSS leans on `text-wrap: balance`, which RN has no
       * equivalent for. At 250 the break left "focus." alone on the second line; at 200 it
       * split "phone-free" at its hyphen, which is worse - a hyphenated word broken across
       * lines reads as a typo. 175 is the width at which it breaks after "for", where balance
       * would have put it.
       */
      maxWidth: 175,
      fontFamily: "PlusJakartaSans_500Medium",
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },

    loader: { width: 72, height: 4, borderRadius: 99, overflow: "hidden", marginBottom: 62 },
    loaderFill: { width: 29, height: 4, borderRadius: 99 },
  });
