import React from "react";
import { View } from "react-native";
import { useTheme } from "../state/ThemeContext";

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
 *
 * The two defaults resolve at render rather than in the signature: a default argument is
 * evaluated against whatever the module imported, which in a switchable theme is the wrong
 * palette half the time.
 */
export function ProgressBar({ pct, height = 9, fill, track }: ProgressBarProps) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
      style={{
        height,
        backgroundColor: track ?? t.surface.progressTrack,
        borderRadius: height / 2,
        overflow: "hidden",
      }}
    >
      <View
        style={{ width: `${clamped}%`, height, backgroundColor: fill ?? t.color.progress, borderRadius: height / 2 }}
      />
    </View>
  );
}
