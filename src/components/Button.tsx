import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { radius, size, space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "destructiveText";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Shows a spinner in place of the label and blocks presses while true. */
  loading?: boolean;
  style?: ViewStyle | ViewStyle[];
}

const variantsFor = (t: Tokens): Record<ButtonVariant, { bg: string; fg: string; border: string; radius: number }> => ({
  primary: { bg: t.color.interactive, fg: t.color.onInteractive, border: "transparent", radius: radius.card },
  secondary: { bg: t.color.fill, fg: t.color.text, border: "transparent", radius: radius.control },
  destructive: { bg: "transparent", fg: t.color.danger, border: t.color.dangerBorder, radius: radius.card },
  destructiveText: { bg: "transparent", fg: t.color.danger, border: "transparent", radius: 0 },
});

export function Button({ label, onPress, variant = "primary", disabled, loading = false, style }: ButtonProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const v = variantsFor(theme)[variant];
  const inert = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inert, busy: loading }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: v.radius,
          backgroundColor: variant === "primary" && pressed ? theme.color.interactivePress : v.bg,
          borderWidth: variant === "destructive" ? 1.5 : 0,
          borderColor: v.border,
          opacity: inert ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        /*
         * Never wraps. A button in a side-by-side pair is flex: 1 — half a narrow modal, less
         * 40px of its own padding — and a two-word label broke onto a second line there, making
         * that button taller than the one beside it and the pair visibly ragged (seen on the
         * delete-account dialog, 2026-09-25). One line is the right constraint for a control
         * whose label should always be short enough to read at a glance.
         */
        <Text numberOfLines={1} style={t(T.button, { color: v.fg })}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const makeStyles = (_t: Tokens) =>
  StyleSheet.create({
    base: {
      minHeight: size.button,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: space.gutter,
    },
  });
