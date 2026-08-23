import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { fontSize } from "../theme/typography";
import { minTouchTarget, radii } from "../theme/spacing";
import { Text } from "./Text";

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  regularHeight: {
    minHeight: minTouchTarget,
  },
  largeHeight: {
    minHeight: 52,
  },
});

type Variant = "primary" | "secondary" | "destructive" | "destructiveSolid" | "outlinePrimary";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Slightly taller (52px) primary CTA used for hero actions like "Start Focus Session". */
  large?: boolean;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  large = false,
}: ButtonProps) {
  const { colors } = useAppearance();
  const isDisabled = disabled || loading;

  const variantStyle = {
    primary: { backgroundColor: colors.primary, borderWidth: 0, textColor: "#FFFFFF" },
    secondary: { backgroundColor: colors.neutralFill, borderWidth: 0, textColor: colors.textDark },
    destructive: { backgroundColor: colors.bgCard, borderWidth: 1.5, borderColor: colors.destructive, textColor: colors.destructive },
    // Solid fill — reserved for the final confirm step inside a ConfirmModal (e.g. "Delete"),
    // distinct from the outlined `destructive` variant used for standalone actions like "End Session".
    destructiveSolid: { backgroundColor: colors.destructive, borderWidth: 0, textColor: "#FFFFFF" },
    // Outlined green — e.g. the "Done" action on a reminder-task row, secondary in emphasis to "Focus".
    outlinePrimary: { backgroundColor: colors.bgCard, borderWidth: 1.5, borderColor: colors.primary, textColor: colors.primary },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        large ? styles.largeHeight : styles.regularHeight,
        {
          backgroundColor: variantStyle.backgroundColor,
          borderWidth: variantStyle.borderWidth,
          borderColor: (variantStyle as { borderColor?: string }).borderColor,
          opacity: isDisabled ? 0.4 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.textColor} />
      ) : (
        <Text
          size={large ? fontSize.bodyLg : fontSize.body}
          weight="semiBold"
          color={variantStyle.textColor}
          numberOfLines={1}
          // Truncates rather than wrapping to a second line — a button whose height
          // silently doubles because a label is a touch too long for the width looks
          // broken, especially next to other single-line buttons in the same row.
          ellipsizeMode="tail"
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
