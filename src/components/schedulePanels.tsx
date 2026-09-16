import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TaskType } from "../api/types";
import { color, radius, schedulePanel, space, text as t, type as T } from "../theme";
import { ChevronDownIcon, ChevronRightIcon, RepeatIcon } from "./icons";

/**
 * The Scheduled screen's building blocks.
 *
 * Its rows are deliberately not the `HomeTaskRow` used on Home. Home's row is a workspace — a
 * type tile, a goal tag, an XP figure and a Focus/Done button, because that's where work
 * actually gets done. This screen is a plan: three panels you scan to understand your next
 * few days, where a row's job is to say what and when in one line. Reusing Home's row here
 * made each panel three times taller than the design and buried the structure that is the
 * whole point of the screen.
 */

/** Task-type dot — the one bit of colour on an otherwise monochrome row. */
function TypeDot({ taskType }: { taskType: TaskType }) {
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: taskType === "focus" ? schedulePanel.focusDot : schedulePanel.reminderDot },
      ]}
    />
  );
}

/**
 * A tinted, titled container. `tone` picks the whole surface treatment at once rather than
 * taking a dozen colour props, so a new panel can't end up half-overdue and half-neutral.
 */
export function SchedulePanel({
  label,
  count,
  tone,
  note,
  action,
  children,
}: {
  label: string;
  /** Must equal the number of rows this panel actually renders — see `note` for the rest. */
  count: number;
  tone: "overdue" | "neutral";
  /**
   * A short qualifier about the rows below ("3 late"), sitting after the rule rather than
   * inside the count. Anything the panel doesn't list must not be added to its badge: a
   * number the user can't reconcile with the rows in front of them is worse than no number.
   */
  note?: string;
  /** Optional control in the header — the Overdue panel's "Move all to today". */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const skin = tone === "overdue" ? schedulePanel.overdue : schedulePanel.neutral;
  return (
    <View style={[styles.panel, { backgroundColor: skin.bg, borderColor: skin.border }]}>
      <View style={styles.panelHeader}>
        <Text style={t(T.eyebrow, { fontSize: 11, letterSpacing: 1.32, color: skin.label })} numberOfLines={1}>
          {label}
        </Text>
        <View style={[styles.countPill, { backgroundColor: skin.badgeBg }]}>
          <Text style={t(T.badge, { fontSize: 11, letterSpacing: 0, color: skin.badgeFg })}>{count}</Text>
        </View>
        <View style={[styles.rule, { backgroundColor: skin.rule }]} />
        {note ? (
          <Text style={t(T.badge, { fontSize: 10, letterSpacing: 0, color: color.danger })} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
        {action}
      </View>
      <View style={styles.panelBody}>{children}</View>
    </View>
  );
}

/**
 * Overdue row — dot, name, why-it-matters line, chevron.
 *
 * The chevron rather than a Focus/Done button: an overdue task usually needs rescheduling
 * or rethinking, not blind completion, and the detail screen is where both are possible.
 */
export function OverdueRow({
  title,
  taskType,
  subtitle,
  actionLabel,
  onPress,
  onAction,
}: {
  title: string;
  taskType: TaskType;
  subtitle: string;
  /** Omit to leave the row open-only — the chevron then stands in for the action. */
  actionLabel?: string;
  onPress: () => void;
  onAction?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={[styles.row, { borderColor: schedulePanel.overdue.rowBorder }]}
    >
      <TypeDot taskType={taskType} />
      <View style={styles.rowText}>
        <Text style={t(T.body, { fontSize: 15, fontWeight: "700", color: color.text })} numberOfLines={1}>
          {title}
        </Text>
        <Text style={t(T.meta, { fontSize: 12, color: color.textMuted, marginTop: 2 })} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {/* An overdue task is the one thing on this screen that's actionable right now — it
          was meant to be done already. Making it openable-only meant the screen dedicated to
          what you're behind on was the one place you couldn't act on it. */}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${title}`}
          onPress={onAction}
          hitSlop={6}
          style={styles.rowAction}
        >
          <Text style={t(T.meta, { fontSize: 12, fontWeight: "800", color: schedulePanel.overdue.moreText })}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : (
        <ChevronRightIcon />
      )}
    </Pressable>
  );
}

/**
 * Moves every overdue task to today in one action.
 *
 * Catching up used to mean opening one screen per missed task, which turns an overdue list
 * into a punishment rather than a tool — the more behind you are, the more work it takes to
 * stop being behind.
 */
export function MoveAllToTodayButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Move all ${count} overdue tasks to today`}
      onPress={onPress}
      hitSlop={6}
      style={styles.panelAction}
    >
      <Text style={t(T.badge, { fontSize: 10, letterSpacing: 0.2, color: schedulePanel.overdue.moreText })}>
        MOVE ALL
      </Text>
    </Pressable>
  );
}

/** The Overdue panel's expander. Named with the remaining count so the tap is a known quantity. */
export function ShowMoreButton({ remaining, onPress }: { remaining: number; onPress: () => void }) {
  return (
    <View style={styles.moreWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show ${remaining} more overdue tasks`}
        onPress={onPress}
        style={styles.morePill}
      >
        <Text style={t(T.meta, { fontSize: 12, fontWeight: "800", color: schedulePanel.overdue.moreText })}>
          {remaining} more
        </Text>
        <ChevronDownIcon />
      </Pressable>
    </View>
  );
}

/**
 * Recurring row — repeat tile, name, "Repeats daily · next Tomorrow".
 *
 * One row per recurring task, never one per future occurrence: this panel is an index of
 * the user's routines, and the next date is a detail of the routine rather than a separate
 * thing to plan around.
 */
export function RecurringRow({
  title,
  subtitle,
  subtitleColor,
  onPress,
}: {
  title: string;
  subtitle: string;
  /** Set when the next occurrence is already overdue, so the row can say so in a warmer tone. */
  subtitleColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={[styles.row, styles.recurringRow]}
    >
      <View style={styles.repeatTile}>
        <RepeatIcon size={16} color={schedulePanel.repeatTileFg} />
      </View>
      <View style={styles.rowText}>
        <Text style={t(T.body, { fontSize: 15, fontWeight: "700", color: color.text })} numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={t(T.meta, { fontSize: 12, color: subtitleColor ?? color.textMuted, marginTop: 2 })}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

/** The date sub-heading inside Upcoming — quieter than a panel header, since it's a sub-group. */
export function DateHeading({ label }: { label: string }) {
  return (
    <View style={styles.dateHeading}>
      <Text style={t(T.eyebrow, { fontSize: 11, letterSpacing: 1.1, color: color.textFaint })} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.dateRule} />
    </View>
  );
}

/**
 * Upcoming row — dot, name, and one trailing word.
 *
 * Single-line on purpose. Under a date heading the day is already established, so the only
 * thing left worth saying is what kind of task it is or what time it fires.
 */
export function UpcomingRow({
  title,
  taskType,
  trailing,
  onPress,
}: {
  title: string;
  taskType: TaskType;
  trailing: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${trailing}`}
      onPress={onPress}
      style={[styles.row, styles.upcomingRow]}
    >
      <TypeDot taskType={taskType} />
      <Text
        style={[t(T.body, { fontSize: 15, fontWeight: "700", color: color.text }), styles.upcomingTitle]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text style={t(T.meta, { fontSize: 12, fontWeight: "700", color: color.textMuted })} numberOfLines={1}>
        {trailing}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 11,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  panelBody: {
    marginTop: 11,
    gap: 7,
  },
  countPill: {
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rule: {
    flex: 1,
    height: 1,
  },
  row: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recurringRow: {
    gap: 11,
  },
  upcomingRow: {
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  upcomingTitle: {
    flex: 1,
    minWidth: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  panelAction: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: schedulePanel.overdue.moreBorder,
    backgroundColor: color.card,
    flexGrow: 0,
    flexShrink: 0,
  },
  rowAction: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: schedulePanel.overdue.moreBorder,
    flexGrow: 0,
    flexShrink: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 3,
    flexGrow: 0,
    flexShrink: 0,
  },
  repeatTile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: schedulePanel.repeatTileBg,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 0,
    flexShrink: 0,
  },
  moreWrap: {
    alignItems: "center",
    marginTop: 11,
  },
  morePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: schedulePanel.overdue.moreBorder,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
    boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 8, spreadDistance: -5, color: "rgba(140,80,55,.45)" }],
  },
  dateHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.sm,
  },
  dateRule: {
    flex: 1,
    height: 1,
    backgroundColor: schedulePanel.dateRule,
  },
});
