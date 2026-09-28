/**
 * The bottom bar, with Ferne docked in the middle — transcribed from the Docked Ferne screens.
 *
 * Capture used to be a hero on Home: a big halo and a "tap to capture" line taking the top third
 * of the screen, which meant capturing depended on being on that screen and scrolled to the top.
 * Docked here it's reachable from every tab, and Home gets the space back for the list.
 *
 * It isn't a tab — there's no Capture screen in this navigator. It opens the capture modal on the
 * root stack, and no tab is ever shown as selected because of it.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { Ferne, useReduceMotion } from "../components/Ferne";
import { HomeTabIcon, ProgressTabIcon, ScheduledTabIcon, SettingsTabIcon } from "../components/icons";
import { px, textAtDesignSize as td, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { TourTarget } from "../state/TourContext";
import type { MainTabParamList } from "./types";

const TAB_ICONS: Record<keyof MainTabParamList, (props: { active: boolean }) => React.ReactElement> = {
  Home: HomeTabIcon,
  Scheduled: ScheduledTabIcon,
  Progress: ProgressTabIcon,
  Settings: SettingsTabIcon,
};

/** How far the capture button rides above the bar. */
const CAPTURE_LIFT = 40;
const CAPTURE_SIZE = 64;

/** The design's two loops behind Ferne: a rim that breathes, and a slow tilt. */
function useKeyframeLoop(durationMs: number, enabled: boolean, easing = Easing.out(Easing.ease)) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      v.setValue(0);
      return;
    }
    const half = { duration: durationMs / 2, easing, useNativeDriver: true };
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, ...half }),
        Animated.timing(v, { toValue: 0, ...half }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [durationMs, enabled, easing, v]);
  return v;
}

function CaptureButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  const moving = !reduceMotion;
  const pulse = useKeyframeLoop(4600, moving);
  const tilt = useKeyframeLoop(12000, moving, Easing.inOut(Easing.ease));

  return (
    <View style={styles.captureColumn}>
      {/* alignSelf so the wrapper hugs the round button instead of stretching to the column's
          width — a full-width wrapper measured as a wide rectangle, and the "circle" shape then
          drew a pill that clipped Ferne's ears. */}
      <TourTarget step="capture" shape="circle" style={styles.captureTourTarget}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Capture tasks"
          onPress={onPress}
          style={styles.captureButton}
        >
          {/* The lit disc Ferne stands on. A gradient rather than a flat fill — the design
              lights it from the top left, which is what stops it reading as a sticker. */}
          <View style={styles.captureDisc}>
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id="captureDisc" cx="44%" cy="34%" r="81%">
                  <Stop offset="0" stopColor={theme.home.captureDiscLit} />
                  <Stop offset="1" stopColor={theme.home.captureDiscShade} />
                </RadialGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#captureDisc)" />
            </Svg>
          </View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.captureRim,
              {
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.12] }),
              },
            ]}
          />
          <Animated.View
            style={{
              marginBottom: 1,
              transform: [{ rotate: tilt.interpolate({ inputRange: [0, 1], outputRange: ["-1.6deg", "1.6deg"] }) }],
            }}
          >
            <Ferne size={58} />
          </Animated.View>
        </Pressable>
      </TourTarget>
      <Text style={td(T.badge, { fontSize: 11, letterSpacing: 0, color: theme.color.success })}>Capture</Text>
    </View>
  );
}

export function DockedTabBar({ state, descriptors, navigation, onCapture }: BottomTabBarProps & { onCapture: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const items = state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const Icon = TAB_ICONS[route.name as keyof MainTabParamList];
    const focused = state.index === index;
    const badge = options.tabBarBadge;

    return (
      <Pressable
        key={route.key}
        // A tab, not a button: the selected state is only announced for a tab role — as a
        // button, react-native-web dropped it and a screen reader couldn't tell which screen
        // you were on. Capture, beside these, stays a button because it opens a sheet.
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        aria-selected={focused}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? route.name}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            // Addressed to the tab navigator by key, not left to bubble. This bar renders
            // outside any screen, so a plain navigate() is handled by the root stack instead —
            // which has no tab of this name and silently drops it. Nothing happened when a tab
            // was tapped until this said where the action was going.
            navigation.dispatch({ ...CommonActions.navigate(route.name, route.params), target: state.key });
          }
        }}
        style={styles.tab}
      >
        <View>
          <Icon active={focused} />
          {/* Overdue work is the one thing a tab has to say without being opened. */}
          {badge != null ? (
            <View style={styles.badge}>
              <Text style={td(T.badge, { fontSize: 9, letterSpacing: 0, color: theme.color.onInteractive })}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={td(T.badge, {
            fontSize: 11,
            letterSpacing: 0,
            lineHeight: 14,
            fontWeight: focused ? "700" : "600",
            color: focused ? theme.color.interactive : theme.color.textFaint,
          })}
        >
          {route.name}
        </Text>
      </Pressable>
    );
  });

  return (
    // The inset rides on the padding rather than on a fixed height: the bar is as tall as its
    // content, and the capture button is allowed to hang out of the top of it.
    <View style={[styles.bar, { paddingBottom: 14 + insets.bottom }]}>
      {items.slice(0, 2)}
      <CaptureButton onPress={onCapture} />
      {items.slice(2)}
    </View>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    bar: {
      borderTopWidth: 1,
      borderTopColor: t.color.border,
      backgroundColor: t.color.card,
      flexDirection: "row",
      alignItems: "flex-end",
      paddingTop: 9,
      // Nothing clips the capture button, which sits above this box.
      overflow: "visible",
    },
    tab: {
      flex: 1,
      alignItems: "center",
      gap: 3,
    },
    badge: {
      position: "absolute",
      top: -4,
      right: -10,
      minWidth: 16,
      height: px(16),
      borderRadius: 8,
      paddingHorizontal: 4,
      backgroundColor: t.color.danger,
      alignItems: "center",
      justifyContent: "center",
    },
    captureColumn: {
      width: px(84),
      flexShrink: 0,
      alignItems: "center",
      gap: 2,
    },
    captureTourTarget: {
      // Sized explicitly to the button rather than left to shrink-wrap. A wrapper that takes
      // the column's full width measures as a wide rectangle, and "circle" then draws a pill
      // that clips Ferne's ears. The lift is mirrored so the wrapper sits over the disc, which
      // protrudes above the bar.
      width: CAPTURE_SIZE,
      height: CAPTURE_SIZE,
      marginTop: -CAPTURE_LIFT,
      alignSelf: "center",
    },
    captureButton: {
      width: CAPTURE_SIZE,
      height: CAPTURE_SIZE,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    captureDisc: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: CAPTURE_SIZE / 2,
      borderWidth: 2,
      borderColor: t.color.screen,
      overflow: "hidden",
      boxShadow: [{ offsetX: 0, offsetY: 5, blurRadius: 16, color: t.home.captureShadow }],
    },
    captureRim: {
      position: "absolute",
      top: -5,
      left: -5,
      width: CAPTURE_SIZE + 10,
      height: CAPTURE_SIZE + 10,
      borderRadius: (CAPTURE_SIZE + 10) / 2,
      borderWidth: 1.5,
      borderColor: t.home.captureRim,
    },
  });
