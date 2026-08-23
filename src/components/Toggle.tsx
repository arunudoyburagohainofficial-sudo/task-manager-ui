import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";

const styles = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    borderRadius: radii.pill,
    justifyContent: "center",
  },
  knob: {
    position: "absolute",
    top: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
});

interface ToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

/** 48x28 pill, 22px knob, green when on. */
export function Toggle({ value, onChange, disabled = false }: ToggleProps) {
  const { colors } = useAppearance();
  const knobLeft = useRef(new Animated.Value(value ? 23 : 3)).current;

  useEffect(() => {
    Animated.timing(knobLeft, { toValue: value ? 23 : 3, duration: 200, useNativeDriver: false }).start();
  }, [value, knobLeft]);

  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      hitSlop={8}
      style={[styles.track, { backgroundColor: value ? colors.primary : colors.toggleOff, opacity: disabled ? 0.5 : 1 }]}
    >
      <Animated.View style={[styles.knob, { left: knobLeft }]} />
    </Pressable>
  );
}
