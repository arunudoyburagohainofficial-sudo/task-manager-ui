import React, { useState } from "react";
import { Pressable, Text } from "react-native";
import { color as palette, text as t, type as T } from "../theme";
import { infoCopy, type InfoTopic } from "../theme/infoCopy";
import { BottomSheet } from "./BottomSheet";
import { Body, H2 } from "./Text";

interface InfoTooltipProps {
  topic: InfoTopic;
  /** Match the surrounding label's colour — a faint ⓘ next to dark text reads as disabled. */
  color?: string;
}

/**
 * Small ⓘ that opens a bottom sheet explaining a progress mechanic (streak / weekly
 * progress) in plain language. One copy source (see infoCopy.ts) reused everywhere the
 * concept appears, so the explanation is identical on every screen rather than each one
 * describing it slightly differently.
 */
export function InfoTooltip({ topic, color }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const { title, body } = infoCopy[topic];

  return (
    <>
      {/* Stops propagation deliberately — this ends up nested inside screen-wide
          "tap anywhere to continue" Pressables (e.g. CompletionScreen), and a tap meant to
          open an explanation should never also trigger whatever the parent does on press. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`About ${title}`}
        onPress={(e) => {
          e.stopPropagation();
          setVisible(true);
        }}
        hitSlop={10}
      >
        <Text style={t(T.meta, { color: color ?? palette.textFaint })}>ⓘ</Text>
      </Pressable>
      <BottomSheet visible={visible} onClose={() => setVisible(false)}>
        <H2>{title}</H2>
        <Body style={{ lineHeight: 22 }}>{body}</Body>
      </BottomSheet>
    </>
  );
}
