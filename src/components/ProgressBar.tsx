import React from "react";
import { View } from "react-native";
import { color } from "../theme";

interface ProgressBarProps {
  /** 0–100; clamped, so callers can hand over raw ratios without guarding. */
  pct: number;
  height?: number;
  /** Overrides the teal progress colour — goals tint their own bar with the goal colour. */
  fill?: string;
  track?: string;
}

/**
 * Teal by default and never interactive — the design reserves `color.interactive` for
 * things you can press, so a progress fill must not use it.
 */
export function ProgressBar({ pct, height = 9, fill = color.progress, track = color.fill }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
      style={{ height, backgroundColor: track, borderRadius: height / 2, overflow: "hidden" }}
    >
      <View style={{ width: `${clamped}%`, height, backgroundColor: fill, borderRadius: height / 2 }} />
    </View>
  );
}
