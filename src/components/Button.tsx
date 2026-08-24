import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { color, radius, size, space, text as t, type as T } from "../theme";

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

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string; radius: number }> = {
  primary: { bg: color.interactive, fg: color.onInteractive, border: "transparent", radius: radius.card },
  secondary: { bg: color.fill, fg: color.text, border: "transparent", radius: radius.control },
  destructive: { bg: "transparent", fg: color.danger, border: color.dangerBorder, radius: radius.card },
  destructiveText: { bg: "transparent", fg: color.danger, border: "transparent", radius: 0 },
};

export function Button({ label, onPress, variant = "primary", disabled, loading = false, style }: ButtonProps) {
  const v = VARIANTS[variant];
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
          backgroundColor: variant === "primary" && pressed ? color.interactivePress : v.bg,
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
        <Text style={t(T.button, { color: v.fg })}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: size.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.gutter,
  },
});
