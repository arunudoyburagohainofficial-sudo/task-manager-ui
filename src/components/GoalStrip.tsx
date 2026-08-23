import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import type { GoalDto } from "../api/types";
import { Body, Text } from "./Text";
import { ProgressBar } from "./ProgressBar";

const styles = StyleSheet.create({
  scrollContent: {
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  chip: {
    width: 160,
    borderRadius: radii.control,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  chipHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  chipName: {
    flex: 1,
  },
  newChip: {
    width: 110,
    minHeight: 40,
    borderRadius: radii.control,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyHint: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});

/** Days done over days targeted, clamped — a goal that runs past its target still reads 100%. */
function progressPercent(goal: GoalDto): number {
  return Math.min(100, (goal.totalDaysActive / Math.max(1, goal.targetDays)) * 100);
}

function GoalChip({ goal, onPress }: { goal: GoalDto; onPress?: () => void }) {
  const { colors } = useAppearance();

  const chip = (
    <View style={[styles.chip, { backgroundColor: colors.bgCard, borderColor: colors.borderCard }]}>
      <View style={styles.chipHeaderRow}>
        <View style={[styles.chipSwatch, { backgroundColor: goal.color ?? colors.primary }]} />
        <Text weight="bold" numberOfLines={1} style={styles.chipName} size={fontSize.caption}>
          {goal.name}
        </Text>
      </View>
      <ProgressBar percent={progressPercent(goal)} height={8} color={goal.color ?? colors.primary} />
      <Body size={fontSize.micro} color={colors.textFaint}>
        {goal.totalDaysActive}/{goal.targetDays} days
        {goal.status === "completed" ? " · reached 🎯" : ""}
      </Body>
    </View>
  );

  // A chip with nowhere to go is a plain View, not a Pressable with a no-op handler —
  // otherwise Progress's read-only copy would still give press feedback and read as
  // tappable when it isn't.
  return onPress ? <Pressable onPress={onPress}>{chip}</Pressable> : chip;
}

interface GoalStripProps {
  goals: GoalDto[];
  /** Omit to render read-only chips — Progress reviews goals, Home is where they're edited. */
  onSelectGoal?: (goal: GoalDto) => void;
  /** Omit to hide the "+ Goal" affordance. */
  onCreateGoal?: () => void;
  /** Shown in place of the strip when there are no goals and no way to create one here. */
  emptyHint?: string;
}

/**
 * One horizontal row of goal chips, shared by Home (tappable, with "+ Goal") and Progress
 * (read-only summary). Horizontal rather than a list so the section stays exactly one row
 * tall no matter how many goals exist — it sits in fixed header space on both screens.
 */
export function GoalStrip({ goals, onSelectGoal, onCreateGoal, emptyHint }: GoalStripProps) {
  const { colors } = useAppearance();

  if (goals.length === 0 && !onCreateGoal) {
    return emptyHint ? (
      <View style={styles.emptyHint}>
        <Body size={fontSize.caption} color={colors.textFaint}>
          {emptyHint}
        </Body>
      </View>
    ) : null;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {goals.map((goal) => (
        <GoalChip key={goal.id} goal={goal} onPress={onSelectGoal ? () => onSelectGoal(goal) : undefined} />
      ))}
      {onCreateGoal ? (
        <Pressable onPress={onCreateGoal} style={[styles.newChip, { borderColor: colors.borderCard }]}>
          <Body size={fontSize.caption} weight="semiBold" color={colors.textMuted}>
            + Goal
          </Body>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
