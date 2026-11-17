import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { px, radius, space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { ChevronDownIcon, ChevronRightIcon } from "./icons";

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
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const skin = tone === "overdue" ? theme.schedulePanel.overdue : theme.schedulePanel.neutral;
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
          <Text style={t(T.badge, { fontSize: 10, letterSpacing: 0, color: theme.color.danger })} numberOfLines={1}>
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
 * Moves every overdue task to today in one action.
 *
 * Catching up used to mean opening one screen per missed task, which turns an overdue list
 * into a punishment rather than a tool — the more behind you are, the more work it takes to
 * stop being behind.
 */
export function MoveAllToTodayButton({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Move all ${count} overdue tasks to today`}
      onPress={onPress}
      hitSlop={6}
      style={styles.panelAction}
    >
      <Text style={t(T.badge, { fontSize: 10, letterSpacing: 0.2, color: theme.schedulePanel.overdue.moreText })}>
        MOVE ALL
      </Text>
    </Pressable>
  );
}

/**
 * Deletes every overdue task in one action.
 *
 * Sits beside Move all because the two answers to a backlog are "I'll still do these" and "these
 * stopped mattering", and only the first one had a bulk action. Working through a list of things
 * you have already decided against, one screen at a time, is the same punishment Move all exists
 * to remove.
 *
 * Drawn in the danger colour, and its confirmation says the deletion cannot be undone, because
 * unlike Move all this destroys work rather than rescheduling it.
 */
export function ClearAllOverdueButton({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Delete all ${count} overdue task${count === 1 ? "" : "s"}`}
      onPress={onPress}
      hitSlop={6}
      style={styles.panelAction}
    >
      <Text style={t(T.badge, { fontSize: 10, letterSpacing: 0.2, color: theme.color.danger })}>CLEAR ALL</Text>
    </Pressable>
  );
}

/**
 * The expander under a folded list. Named with the remaining count so the tap is a known quantity.
 *
 * Overdue's by default, which is where it started. Anytime folds too now, and it sits on the
 * plain page rather than inside the tinted Overdue panel, so `tone` gives it the neutral border
 * and ink the Recurring panel uses - a terracotta pill there read as a second Overdue.
 */
export function ShowMoreButton({
  remaining,
  onPress,
  what = "overdue tasks",
  tone = "overdue",
}: {
  remaining: number;
  onPress: () => void;
  /** What the hidden rows are, for the spoken label: "Show 12 more overdue tasks". */
  what?: string;
  tone?: "overdue" | "neutral";
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ink = tone === "neutral" ? theme.schedulePanel.neutral.label : theme.schedulePanel.overdue.moreText;
  return (
    <View style={styles.moreWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show ${remaining} more ${what}`}
        onPress={onPress}
        style={[styles.morePill, tone === "neutral" && styles.morePillNeutral]}
      >
        <Text style={t(T.meta, { fontSize: 12, fontWeight: "800", color: ink })}>
          {remaining} more
        </Text>
        <ChevronDownIcon color={ink} />
      </Pressable>
    </View>
  );
}

/** The date sub-heading inside Upcoming — quieter than a panel header, since it's a sub-group. */
export function DateHeading({ label }: { label: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.dateHeading}>
      <Text style={t(T.eyebrow, { fontSize: 11, letterSpacing: 1.1, color: theme.color.textFaint })} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.dateRule} />
    </View>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
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
    upcomingRow: {
      paddingVertical: 11,
      paddingHorizontal: 13,
    },
    panelAction: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: t.schedulePanel.overdue.moreBorder,
      backgroundColor: t.color.card,
      flexGrow: 0,
      flexShrink: 0,
    },
    rowAction: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.control,
      borderWidth: 1,
      borderColor: t.schedulePanel.overdue.moreBorder,
      flexGrow: 0,
      flexShrink: 0,
    },
    dot: {
      width: px(8),
      height: px(8),
      borderRadius: 3,
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
      backgroundColor: t.color.card,
      borderWidth: 1,
      borderColor: t.schedulePanel.overdue.moreBorder,
      borderRadius: radius.pill,
      paddingVertical: 7,
      paddingHorizontal: 14,
      boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 8, spreadDistance: -5, color: "rgba(140,80,55,.45)" }],
    },
    morePillNeutral: {
      borderColor: t.schedulePanel.neutral.border,
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
      backgroundColor: t.schedulePanel.dateRule,
    },
  });
