import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { GoalDto } from "../api/types";
import { radius, space, size } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { BottomSheet } from "./BottomSheet";
import { Body, H2, Meta } from "./Text";

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
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  function handleSelect(goalId: string | null) {
    onSelect(goalId);
    onClose();
  }

  function row(key: string, selected: boolean, swatch: string, title: string, detail: string | null, onPress: () => void) {
    return (
      <Pressable
        key={key}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        aria-checked={selected}
        onPress={onPress}
        style={[styles.row, selected && styles.rowSelected]}
      >
        <View style={[styles.swatch, { backgroundColor: swatch }]} />
        <View style={styles.rowText}>
          <Body style={{ color: selected ? theme.color.selectedText : theme.color.text, fontWeight: "700" }}>{title}</Body>
          {detail ? <Meta style={{ marginTop: 2 }}>{detail}</Meta> : null}
        </View>
        {selected ? <Body style={{ color: theme.color.selectedText, fontWeight: "800" }}>✓</Body> : null}
      </Pressable>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <H2>Count toward a goal</H2>
      <View style={styles.list}>
        {row("none", selectedGoalId === null, theme.color.textFaint, "No goal", null, () => handleSelect(null))}

        {goals.map((goal) =>
          row(
            goal.id,
            goal.id === selectedGoalId,
            goal.color ?? theme.color.goal,
            goal.name,
            `${goal.totalDaysActive}/${goal.targetDays} days${goal.status === "completed" ? " · reached" : ""}`,
            () => handleSelect(goal.id)
          )
        )}

        {goals.length === 0 ? (
          <Meta style={styles.empty}>No goals yet — create one from Home to start tracking longer-term work.</Meta>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    list: {
      gap: space.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.base,
      minHeight: size.minTouch,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.control,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    rowSelected: {
      borderWidth: 1.5,
      borderColor: t.color.interactive,
      backgroundColor: t.color.selectedTint,
    },
    swatch: {
      width: 12,
      height: 12,
      borderRadius: 3,
    },
    rowText: {
      flex: 1,
    },
    empty: {
      paddingVertical: 8,
    },
  });
