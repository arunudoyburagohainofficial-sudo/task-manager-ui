import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { CompanionOrb } from "./CompanionOrb";
import { Text } from "./Text";
import { fontSize } from "../theme/typography";

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
  },
});

interface PulseCaptureButtonProps {
  onPress: () => void;
}

/**
 * Hero capture button — per design_handoff_focus_capture_app 2/COMPANION.md
 * "Placement rules > Home": the capture button IS the companion (84px orb, idle state).
 * Accessibility label stays generic regardless of orb state/name, per the addendum's
 * accessibility rule.
 */
export function PulseCaptureButton({ onPress }: PulseCaptureButtonProps) {
  const { colors } = useAppearance();

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Capture a task"
      >
        <CompanionOrb state="idle" size={84} />
      </Pressable>
      <Text size={fontSize.label} weight="semiBold" color={colors.primary}>
        Tap to capture
      </Text>
    </View>
  );
}
