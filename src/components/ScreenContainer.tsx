import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color } from "../theme";
import { ScreenWash } from "./ScreenWash";

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
  /**
   * Replaces the gradient wash with one flat colour. Passing this is what opts a screen
   * out of the shared background — used where a screen deliberately wants a calmer,
   * single-tone field rather than the app's ambient one.
   */
  backgroundColor?: string;
}

/**
 * Every screen's outer frame, and the single place the background wash is mounted.
 *
 * The wash sits inside the SafeAreaView but behind the content, so it covers the status-bar
 * inset too and every screen shares one continuous field — moving between tabs doesn't
 * change the colours under the content.
 */
export function ScreenContainer({ children, style, backgroundColor }: ScreenContainerProps) {
  const flat = backgroundColor != null;
  const bg = backgroundColor ?? color.screen;
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
      {flat ? null : <ScreenWash />}
      {/* No backgroundColor here when the wash is on — an opaque content view would paint
          straight over it. */}
      <View style={[styles.content, flat && { backgroundColor: bg }, style]}>{children}</View>
    </SafeAreaView>
  );
}
