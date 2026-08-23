import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";

const styles = StyleSheet.create({
  track: {
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radii.pill,
  },
});

interface ProgressBarProps {
  /** 0-100 */
  percent: number;
  height?: number;
  color?: string;
  /** Session timer bar updates every second with a linear fill instead of ease-out. */
  linear?: boolean;
}

/**
 * Self-contained progress module — per the design handoff this is meant to stay
 * swappable for a themed variant (e.g. tree growth) later; keep all fill logic here.
 */
export function ProgressBar({ percent, height = 12, color, linear = false }: ProgressBarProps) {
  const { colors } = useAppearance();
  const widthAnim = useRef(new Animated.Value(percent)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: percent,
      duration: linear ? 1000 : 400,
      easing: linear ? Easing.linear : Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [percent, linear, widthAnim]);

  return (
    <View style={[styles.track, { height, backgroundColor: colors.neutralFill }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color ?? colors.primary,
            width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
          },
        ]}
      />
    </View>
  );
}
