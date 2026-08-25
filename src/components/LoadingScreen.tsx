import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { color } from "../theme";

/**
 * Fills the same visual role as the native splash screen (see app.json's expo-splash-
 * screen config), but for the one gap that config can't cover: an interactive sign-in.
 * The native splash only exists between process start and the first JS frame — once
 * it's been hidden, hiding/re-showing it isn't reliably possible on either platform, so
 * a fresh sign-in's own prefetch (see SessionContext) would otherwise leave Home
 * rendering half-empty until each query resolves. This renders in its place instead,
 * reusing the exact same asset so the handoff from native splash to this to real content
 * reads as one continuous screen rather than a flash of something else in between.
 */
export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <Image source={require("../../assets/splash.png")} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.ferne,
  },
  logo: {
    width: 240,
    height: 180,
  },
});
