import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppearance } from "../state/AppearanceContext";

interface ScreenContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Focus Session uses a deliberately calmer off-white background than the standard screen bg. */
  backgroundColor?: string;
}

export function ScreenContainer({ children, style, backgroundColor }: ScreenContainerProps) {
  const { colors } = useAppearance();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: backgroundColor ?? colors.bgScreen }} edges={["top", "bottom"]}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </SafeAreaView>
  );
}
