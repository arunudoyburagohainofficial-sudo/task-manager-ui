import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.control,
    padding: 16,
  },
});

/** White, 1px-bordered card with 16px padding — the base building block for most screens. */
export function Card({ style, ...rest }: ViewProps) {
  const { colors } = useAppearance();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgCard,
          borderWidth: 1,
          borderColor: colors.borderCard,
        },
        style,
      ]}
      {...rest}
    />
  );
}
