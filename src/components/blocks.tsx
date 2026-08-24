import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { GoalDto, TaskType } from "../api/types";
import { color, radius, space, text as t, type as T } from "../theme";
import { Card } from "./Card";
import { BellGlyph, TargetGlyph } from "./icons";

/**
 * Rounded icon tile for Home's To do / Completed rows — bell for reminder tasks, target
 * for focus, one glyph shape per type recoloured per row state. `completed` collapses both
 * types to the same muted olive tone, since a finished task no longer needs its type to
 * stand out the way an actionable one does.
 */
function TaskTypeTile({ taskType, completed = false, size: d = 36 }: { taskType: TaskType; completed?: boolean; size?: number }) {
  const isFocus = taskType === "focus";
  const bg = completed ? color.taskTypeCompletedBg : isFocus ? color.taskTypeFocusBg : color.taskTypeReminderBg;
  const fg = completed ? color.doneCheck : isFocus ? color.taskTypeFocusFg : color.taskTypeReminderFg;
  const Glyph = isFocus ? TargetGlyph : BellGlyph;

  return (
    <View style={[styles.typeTile, { width: d, height: d, backgroundColor: bg }]}>
      <Glyph size={Math.round(d * 0.5)} color={fg} />
    </View>
  );
}

/** "Focus" / "Reminder", tinted to match the tile — the row's type label under the title. */
function TaskTypeLabel({ taskType }: { taskType: TaskType }) {
  const isFocus = taskType === "focus";
  return (
    <Text style={t(T.meta, { fontWeight: "700", color: isFocus ? color.taskTypeFocusFg : color.taskTypeReminderFg })}>
      {isFocus ? "Focus" : "Reminder"}
    </Text>
  );
}

/**
 * Section divider: LABEL · count · rule · collapse chevron. The chevron is the whole
 * header's affordance — the row itself is the tap target so the label and count are
 * pressable too, not just the 30px box.
 */
export function SectionHeader({
  label,
  count,
  labelColor,
  countStyle,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  labelColor: string;
  countStyle: { bg: string; fg: string };
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={!onToggle}
      accessibilityRole={onToggle ? "button" : undefined}
      accessibilityState={onToggle ? { expanded: !collapsed } : undefined}
      accessibilityLabel={onToggle ? `${label}, ${count} items, ${collapsed ? "collapsed" : "expanded"}` : undefined}
      style={styles.sectionHeader}
    >
      <Text style={t(T.eyebrow, { fontSize: 12, letterSpacing: 1.2, color: labelColor })}>{label}</Text>
      <View style={[styles.countPill, { backgroundColor: countStyle.bg }]}>
        <Text style={t(T.meta, { fontSize: 12, fontWeight: "800", color: countStyle.fg })}>{count}</Text>
      </View>
      <View style={styles.rule} />
      {onToggle ? (
        <View style={styles.chevron}>
          <Text style={t(T.badge, { fontSize: 10, letterSpacing: 0, color: color.textMuted })}>
            {collapsed ? "▸" : "▾"}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Pending task row — type tile, title + type label, and a trailing action button. */
export function TaskRow({
  title,
  taskType,
  subtitle,
  actionLabel,
  onPress,
  onAction,
}: {
  title: string;
  taskType: TaskType;
  subtitle?: string | null;
  actionLabel: string;
  onPress: () => void;
  onAction: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.taskRow}>
      <TaskTypeTile taskType={taskType} />
      <View style={styles.taskRowText}>
        <Text style={t(T.bodyLg, { color: color.text })}>{title}</Text>
        <TaskTypeLabel taskType={taskType} />
        {subtitle ? <Text style={t(T.meta, { color: color.textFaint, marginTop: 2 })}>{subtitle}</Text> : null}
      </View>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel}: ${title}`}
        style={styles.taskRowAction}
      >
        <Text style={t(T.label, { fontWeight: "700", color: "#4A3608" })}>{actionLabel}</Text>
      </Pressable>
    </Pressable>
  );
}

/** Completed task row — type tile (muted), struck-through title, check mark. */
export function CompletedRow({
  title,
  taskType,
  onPress,
}: {
  title: string;
  taskType: TaskType;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} style={styles.completedRow}>
      <TaskTypeTile taskType={taskType} completed size={32} />
      <Text style={t(T.body, { color: color.doneText, textDecorationLine: "line-through", flex: 1 })}>{title}</Text>
      <Text style={t(T.bodyLg, { color: color.doneCheck })}>✓</Text>
    </Pressable>
  );
}

/** Goal tile — name, progress bar tinted with the goal's own colour, day count. */
export function GoalCard({ goal, onPress, width }: { goal: GoalDto; onPress?: () => void; width?: number }) {
  const accent = goal.color ?? color.goal;
  const pct = goal.targetDays ? Math.min(100, (goal.totalDaysActive / goal.targetDays) * 100) : 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${goal.name}, ${goal.totalDaysActive} of ${goal.targetDays} days`}
      style={width ? { width } : { flex: 1 }}
    >
      <Card style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View style={[styles.goalSwatch, { backgroundColor: accent }]} />
          <Text style={t(T.body, { fontWeight: "700", color: color.text, flex: 1 })} numberOfLines={1}>
            {goal.name}
          </Text>
        </View>
        <View style={styles.goalTrack}>
          <View style={{ width: `${pct}%`, height: 6, backgroundColor: accent, borderRadius: 3 }} />
        </View>
        <Text style={t(T.meta, { color: color.textMuted })}>
          {goal.totalDaysActive}/{goal.targetDays} days
          {goal.status === "completed" ? " · reached" : ""}
        </Text>
      </Card>
    </Pressable>
  );
}

/** Dashed "+ Goal" tile that sits at the end of the goal strip. */
export function AddGoalCard({ onPress, width = 78 }: { onPress: () => void; width?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="New goal" style={[styles.addGoal, { width }]}>
      <Text style={t(T.meta, { color: color.textMuted })}>+ Goal</Text>
    </Pressable>
  );
}

/** Metric tile used across the Progress tabs. */
export function StatCard({
  value,
  label,
  accent = false,
  trailing,
}: {
  value: string;
  label: string;
  accent?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Card style={styles.statCard}>
      <View style={styles.statValueRow}>
        <Text style={t(T.h2, { color: accent ? color.success : color.text })}>{value}</Text>
        {trailing}
      </View>
      <Text style={t(T.meta, { color: color.textMuted, marginTop: 3 })}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 36,
    marginTop: 22,
    marginBottom: 10,
  },
  countPill: {
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: color.border,
  },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  typeTile: {
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 0,
    flexShrink: 0,
  },
  taskRow: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    paddingVertical: 11,
    paddingLeft: 11,
    paddingRight: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  taskRowText: {
    flex: 1,
  },
  taskRowAction: {
    backgroundColor: "#EBC294",
    borderRadius: radius.control,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  completedRow: {
    backgroundColor: color.doneFill,
    borderWidth: 1,
    borderColor: color.doneBorder,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: space.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  goalCard: {
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  goalSwatch: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  goalTrack: {
    height: 6,
    backgroundColor: color.fill,
    borderRadius: 3,
    marginVertical: 10,
    overflow: "hidden",
  },
  addGoal: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#C8D2CE",
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  statCard: {
    flex: 1,
    padding: 14,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
