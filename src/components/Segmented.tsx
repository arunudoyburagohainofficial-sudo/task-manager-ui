import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, radius, shadow, size, space, text as t, type as T } from "../theme";

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
  return (
    <View style={styles.track}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.tab, active && styles.tabActive]}
          >
            {option.icon}
            <Text style={t(T.label, { color: active ? color.onInteractive : color.textBody })}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: color.track,
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
    backgroundColor: color.interactive,
    ...shadow.thumb,
  },
});
