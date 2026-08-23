import React from "react";
import { StyleSheet, StyleProp, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppearance } from "../state/AppearanceContext";

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

interface ScreenContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Focus Session uses a deliberately calmer off-white background than the standard screen bg. */
  backgroundColor?: string;
}

export function ScreenContainer({ children, style, backgroundColor }: ScreenContainerProps) {
  const { colors } = useAppearance();
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: backgroundColor ?? colors.bgScreen }]}
      edges={["top", "bottom"]}
    >
      <View style={[styles.content, style]}>{children}</View>
    </SafeAreaView>
  );
}
