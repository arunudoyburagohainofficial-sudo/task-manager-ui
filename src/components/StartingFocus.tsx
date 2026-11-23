import React, { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

import { Ferne, useReduceMotion } from "./Ferne";
import { SPLASH_PALETTE } from "./LoadingScreen";
import { ScreenWash } from "./ScreenWash";
import { useTheme } from "../state/ThemeContext";

/**
 * The moment between finishing the slide and the timer appearing.
 *
 * Starting a quick focus is two trips to the server - make the task, then open the session on
 * it - and until both are back there is no session to show. Before this screen the slider just
 * sat at its end saying "Starting…" over Home, and the session screen then slid in from nowhere.
 * Now the slide hands straight over to this, and this hands over to the timer: Home is never
 * the thing in front while the app is busy.
 *
 * Light mode is drawn on the splash's ground (SPLASH_PALETTE): the same kind of moment, the app
 * getting ready rather than asking anything of the user. Dark mode is drawn on Home's own - the
 * charcoal, the wash and the app's terracotta - because that is the screen it rises out of, and
 * the splash's brown-black there read as a different app for a moment.
 *
 * A Modal, so it covers the tab bar and the status bar as well as Home - the session screen is
 * pushed underneath it and revealed when this fades out.
 */
export function StartingFocus({
  visible,
  minutes,
  onCancel,
}: {
  visible: boolean;
  /** The whole sitting, as the slider said it: a Pomodoro is cycles x minutes. */
  minutes: number;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const dark = theme.mode === "dark";
  const palette = dark
    ? {
        bg: theme.color.screen,
        ink: theme.color.text,
        muted: theme.color.textMuted,
        accent: theme.color.interactive,
      }
    : {
        bg: SPLASH_PALETTE.light.bg,
        ink: SPLASH_PALETTE.light.ink,
        muted: SPLASH_PALETTE.light.muted,
        accent: SPLASH_PALETTE.light.accentSoft,
      };
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={[styles.screen, { backgroundColor: palette.bg }]}>
        {dark ? (
          // Home's own wash, so the change of screen is the content going rather than the room.
          <ScreenWash variant="home" />
        ) : (
          // The warm light behind Foyg, the one thing on this ground besides her.
          <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
            <Defs>
              <RadialGradient id="startingGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={SPLASH_PALETTE.light.stage} />
                <Stop offset="0.5" stopColor={SPLASH_PALETTE.light.stage} stopOpacity={0.3} />
                <Stop offset="1" stopColor={SPLASH_PALETTE.light.stage} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={width / 2} cy={height * 0.4} rx={200} ry={200} fill="url(#startingGlow)" />
          </Svg>
        )}

        <View style={styles.spacerTop} />

        <View style={styles.centre} accessibilityLiveRegion="polite">
          <Ferne size={120} />
          <Dots color={palette.accent} />
          <Text style={[styles.label, { color: palette.ink }]}>Starting your {minutes} min focus</Text>
        </View>

        <View style={styles.spacerBottom} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel starting the focus session"
          onPress={onCancel}
          hitSlop={12}
          style={[styles.cancel, { marginBottom: insets.bottom + 36 }]}
        >
          <Text style={[styles.cancelInk, { color: palette.muted }]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * Three dots, one lit at a time, moving left to right. The only motion here that means "working"
 * - Foyg floats as she does everywhere, which is life rather than progress. Still under Reduce
 * Motion, with the first one lit.
 */
function Dots({ color }: { color: string }) {
  const reduceMotion = useReduceMotion();
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(phase, { toValue: 1, duration: 1050, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [phase, reduceMotion]);

  const DIM = 0.35;
  const lit = [
    [1, DIM, DIM, 1],
    [DIM, 1, DIM, DIM],
    [DIM, DIM, 1, DIM],
  ];

  return (
    <View style={styles.dots}>
      {lit.map((outputRange, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: color,
              opacity: reduceMotion
                ? i === 0
                  ? 1
                  : DIM
                : phase.interpolate({ inputRange: [0, 1 / 3, 2 / 3, 1], outputRange }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center" },
  spacerTop: { flex: 1 },
  spacerBottom: { flex: 1.35 },
  centre: { alignItems: "center" },
  dots: { flexDirection: "row", gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: {
    marginTop: 16,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    lineHeight: 20,
  },
  cancel: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelInk: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18,
  },
});
