import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { radius, space } from "../theme";
import { useThemedStyles, type Tokens } from "../state/ThemeContext";

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: t.color.card,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: radius.card,
      padding: space.card,
    },
  });

/** White, 1px bordered, radius 12, padding 15 — and deliberately no shadow (design §5). */
export function Card({ style, ...rest }: ViewProps) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.card, style]} {...rest} />;
}
