import React from "react";
import { Pressable, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { Text } from "./Text";
import type { TaskType } from "../api/types";

interface TaskTypeBadgeProps {
  value: TaskType;
  /** Present + tappable during Confirm & Organize; absent (read-only pill) on Task Detail. */
  onChange?: (next: TaskType) => void;
}

const OPTIONS: { value: TaskType; label: string }[] = [
  { value: "focus", label: "🎯 Focus Task" },
  { value: "reminder", label: "🔔 Reminder Task" },
];

/** Segmented toggle: 🎯 Focus Task / 🔔 Reminder Task — active = green bg, white text. */
export function TaskTypeBadge({ value, onChange }: TaskTypeBadgeProps) {
  const { colors } = useAppearance();

  if (!onChange) {
    const option = OPTIONS.find((o) => o.value === value)!;
    return (
      <View
        style={{
          alignSelf: "flex-start",
          backgroundColor: value === "focus" ? colors.primary : colors.neutralFill,
          borderRadius: radii.pill,
          paddingVertical: 6,
          paddingHorizontal: 12,
        }}
      >
        <Text size={fontSize.micro} weight="bold" color={value === "focus" ? "#FFFFFF" : colors.neutralFillText}>
          {option.label}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.neutralFill, borderRadius: radii.control, padding: 3, gap: 3 }}>
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              backgroundColor: active ? colors.primary : "transparent",
            }}
          >
            <Text size={fontSize.micro} weight="bold" color={active ? "#FFFFFF" : colors.textMuted}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
