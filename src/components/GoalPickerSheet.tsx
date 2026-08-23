import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import type { GoalDto } from "../api/types";
import { BottomSheet } from "./BottomSheet";
import { Body, Text } from "./Text";

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.control,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  nameColumn: {
    flex: 1,
  },
  emptyState: {
    paddingVertical: 8,
    gap: 4,
  },
});

interface GoalPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  goals: GoalDto[];
  selectedGoalId: string | null;
  onSelect: (goalId: string | null) => void;
}

/**
 * Pick which goal a task counts toward, or "No goal". Completed goals stay pickable:
 * passing your target isn't a reason to stop logging honest work against it.
 */
export function GoalPickerSheet({ visible, onClose, goals, selectedGoalId, onSelect }: GoalPickerSheetProps) {
  const { colors } = useAppearance();

  function handleSelect(goalId: string | null) {
    onSelect(goalId);
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text size={fontSize.xl} weight="bold">
        Count toward a goal
      </Text>
      <View style={styles.list}>
        <Pressable
          onPress={() => handleSelect(null)}
          style={[
            styles.row,
            {
              borderWidth: selectedGoalId === null ? 2 : 1,
              borderColor: selectedGoalId === null ? colors.primary : colors.borderCard,
              backgroundColor: selectedGoalId === null ? colors.primaryTintBg : colors.bgCard,
            },
          ]}
        >
          <View style={[styles.swatch, { backgroundColor: colors.textFaint }]} />
          <Text
            weight="semiBold"
            style={styles.nameColumn}
            color={selectedGoalId === null ? colors.primaryTintText : colors.textDark}
          >
            No goal
          </Text>
          {selectedGoalId === null ? (
            <Text weight="bold" color={colors.primaryTintText}>
              ✓
            </Text>
          ) : null}
        </Pressable>

        {goals.map((goal) => {
          const selected = goal.id === selectedGoalId;
          return (
            <Pressable
              key={goal.id}
              onPress={() => handleSelect(goal.id)}
              style={[
                styles.row,
                {
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.primary : colors.borderCard,
                  backgroundColor: selected ? colors.primaryTintBg : colors.bgCard,
                },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: goal.color ?? colors.primary }]} />
              <View style={styles.nameColumn}>
                <Text weight="semiBold" color={selected ? colors.primaryTintText : colors.textDark}>
                  {goal.name}
                </Text>
                <Body size={fontSize.micro} color={selected ? colors.primaryTintText : colors.textFaint}>
                  {goal.totalDaysActive}/{goal.targetDays} days
                  {goal.status === "completed" ? " · reached 🎯" : ""}
                </Body>
              </View>
              {selected ? (
                <Text weight="bold" color={colors.primaryTintText}>
                  ✓
                </Text>
              ) : null}
            </Pressable>
          );
        })}

        {goals.length === 0 ? (
          <View style={styles.emptyState}>
            <Body size={fontSize.caption} color={colors.textMuted}>
              No goals yet — create one from Home to start tracking longer-term work.
            </Body>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}
