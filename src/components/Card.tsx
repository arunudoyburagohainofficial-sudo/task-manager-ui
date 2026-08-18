import React from "react";
import { View, ViewProps } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";

/** White, 1px-bordered card with 16px padding — the base building block for most screens. */
export function Card({ style, ...rest }: ViewProps) {
  const { colors, highContrast } = useAppearance();
  return (
    <View
      style={[
        {
          backgroundColor: colors.bgCard,
          borderRadius: radii.control,
          borderWidth: highContrast ? 2 : 1,
          borderColor: colors.borderCard,
          padding: 16,
        },
        style,
      ]}
      {...rest}
    />
  );
}
