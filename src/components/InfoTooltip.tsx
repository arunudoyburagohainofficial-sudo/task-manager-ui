import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { infoCopy, type InfoTopic } from "../theme/infoCopy";
import { fontSize } from "../theme/typography";
import { BottomSheet } from "./BottomSheet";
import { Body, Text } from "./Text";

const styles = StyleSheet.create({
  body: {
    gap: 4,
  },
});

interface InfoTooltipProps {
  topic: InfoTopic;
  /** Match the surrounding label's color — a faint ⓘ next to dark text reads as disabled. */
  color?: string;
}

/**
 * Small ⓘ that opens a bottom sheet explaining a progress mechanic (streak/XP/weekly
 * progress) in plain language. One copy source (see infoCopy.ts) reused everywhere the
 * concept appears, so the explanation is identical on Home, Progress, Completion, and
 * FocusSession rather than four screens each describing it slightly differently.
 */
export function InfoTooltip({ topic, color }: InfoTooltipProps) {
  const { colors } = useAppearance();
  const [visible, setVisible] = useState(false);
  const { title, body } = infoCopy[topic];

  return (
    <>
      {/* Stops propagation deliberately — this ends up nested inside screen-wide
          "tap anywhere to continue" Pressables (e.g. CompletionScreen), and a tap meant to
          open an explanation should never also trigger whatever the parent does on press. */}
      <Pressable onPress={(e) => { e.stopPropagation(); setVisible(true); }} hitSlop={10}>
        <Text size={fontSize.caption} weight="bold" color={color ?? colors.textFaint}>
          ⓘ
        </Text>
      </Pressable>
      <BottomSheet visible={visible} onClose={() => setVisible(false)}>
        <Text size={fontSize.xl} weight="bold">
          {title}
        </Text>
        <View style={styles.body}>
          <Body color={colors.textMuted}>{body}</Body>
        </View>
      </BottomSheet>
    </>
  );
}
