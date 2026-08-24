import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { color, radius, size } from "../theme";

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  /** Required — a bare switch tells a screen reader nothing about what it controls. */
  label: string;
}

export function Toggle({ value, onChange, label }: ToggleProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={[
        styles.track,
        {
          backgroundColor: value ? color.interactive : color.toggleOff,
          justifyContent: value ? "flex-end" : "flex-start",
        },
      ]}
    >
      <View style={styles.knob} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: size.toggleW,
    height: size.toggleH,
    borderRadius: radius.toggle,
    padding: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  knob: {
    width: size.toggleKnob,
    height: size.toggleKnob,
    borderRadius: size.toggleKnob / 2,
    backgroundColor: "#fff",
  },
});
