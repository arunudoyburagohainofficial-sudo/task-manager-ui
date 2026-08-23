import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, ViewStyle } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { fontSize } from "../theme/typography";
import { Body } from "./Text";

const styles = StyleSheet.create({
  bubble: {
    borderWidth: 1,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: "#1A1A1A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
});

interface CompanionBubbleProps {
  text: string;
  style?: ViewStyle;
}

/**
 * Speech bubble component — COMPANION.md "Speech bubble component". One per screen max
 * (enforced by callers, not here); pop-in scale+fade on mount. Supplementary only — never
 * the sole carrier of information (accessibility rule), so callers always show the same
 * data elsewhere too.
 */
export function CompanionBubble({ text, style }: CompanionBubbleProps) {
  const { colors } = useAppearance();
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(pop, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [pop]);

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderCard,
          opacity: pop,
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
        },
        style,
      ]}
    >
      <Body size={fontSize.caption} color={colors.textDark}>
        {text}
      </Body>
    </Animated.View>
  );
}
