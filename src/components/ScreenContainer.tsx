import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color } from "../theme";

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
  /** Overrides the standard warm screen background — the focus session runs calmer. */
  backgroundColor?: string;
}

export function ScreenContainer({ children, style, backgroundColor }: ScreenContainerProps) {
  const bg = backgroundColor ?? color.screen;
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
      <View style={[styles.content, { backgroundColor: bg }, style]}>{children}</View>
    </SafeAreaView>
  );
}
