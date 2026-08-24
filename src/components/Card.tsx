import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { color, radius, space } from "../theme";

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    padding: space.card,
  },
});

/** White, 1px bordered, radius 12, padding 15 — and deliberately no shadow (design §5). */
export function Card({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}
