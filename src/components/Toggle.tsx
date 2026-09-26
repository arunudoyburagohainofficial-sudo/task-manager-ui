import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { radius, size } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  /** Required — a bare switch tells a screen reader nothing about what it controls. */
  label: string;
}

export function Toggle({ value, onChange, label }: ToggleProps) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      // Stated directly as well: react-native-web drops `checked` from accessibilityState, so a
      // screen reader was told there's a switch but never whether it's on.
      aria-checked={value}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={[
        styles.track,
        {
          backgroundColor: value ? t.surface.toggleOn : t.surface.toggleOffTrack,
          justifyContent: value ? "flex-end" : "flex-start",
        },
      ]}
    >
      <View style={styles.knob} />
    </Pressable>
  );
}

/**
 * Green when on, not terracotta: the final screens reserve terracotta for the one action you
 * press and draw state switches in the completion colour.
 */
const makeStyles = (t: Tokens) =>
  StyleSheet.create({
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
      backgroundColor: t.surface.toggleKnob,
    },
  });
