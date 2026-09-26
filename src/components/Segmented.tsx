import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, shadow, size, space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";

interface SegmentedOption<V extends string> {
  value: V;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedProps<V extends string> {
  value: V;
  options: SegmentedOption<V>[];
  onChange: (value: V) => void;
}

/**
 * The design's one segmented control — used for task type and for the Progress period
 * tabs. The active thumb carries `shadow.thumb`, which is the only elevation anywhere in
 * the system.
 */
export function Segmented<V extends string>({ value, options, onChange }: SegmentedProps<V>) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.track}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            onPress={() => onChange(option.value)}
            style={[styles.tab, active && styles.tabActive]}
          >
            {option.icon}
            <Text style={t(T.label, { color: active ? theme.surface.segActiveInk : theme.surface.segIdleInk })}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A pale thumb on a cream track, per the final screens — the active segment is lifted paper, not
 * a filled button. Terracotta stays with the one pressable action on the screen.
 */
const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    track: {
      backgroundColor: t.surface.segTrack,
      borderRadius: radius.track,
      padding: 4,
      flexDirection: "row",
    },
    tab: {
      flex: 1,
      minHeight: size.minTouch,
      borderRadius: radius.tab,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: space.xs,
    },
    tabActive: {
      backgroundColor: t.surface.segActive,
      ...shadow.thumb,
      shadowColor: t.isDark ? "#000" : shadow.thumb.shadowColor,
    },
  });
