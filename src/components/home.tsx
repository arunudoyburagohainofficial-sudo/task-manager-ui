/**
 * Home's own blocks, transcribed from the Docked Ferne screens (9a / 9b).
 *
 * Sizes go through `textAtDesignSize` rather than `text`: those screens are drawn at a phone's
 * own size, so the app-wide 10% trim would make this screen smaller than the design rather than
 * right. See the note on that function.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { GoalDto } from "../api/types";
import { px, textAtDesignSize as td, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { useReduceMotion } from "./Ferne";
import {
  DoneCheckIcon,
  DoneTickMark,
  EnvelopeMark,
  GoalTargetIcon,
  PlusMark,
  ReminderBellMark,
  StreakFlameMark,
  XpIcon,
} from "./icons";

/** CSS `ease-in-out` 0 → 1 → 0, for the design's two-keyframe loops. Native driver. */
function useEaseLoop(durationMs: number, enabled: boolean) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      v.setValue(0);
      return;
    }
    const half = { duration: durationMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true };
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, ...half }),
        Animated.timing(v, { toValue: 0, ...half }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [durationMs, enabled, v]);
  return v;
}

/* ------------------------------------------------------------- stat strip */

/**
 * The three figures under the greeting: days in a row, what today has earned, and how long was
 * spent focused. Points and minutes are different numbers because finishing a reminder earns
 * points and no minutes — see task-svc's TodayProgressService.
 */
export function HomeStatStrip({
  streak,
  points,
  focusMinutes,
}: {
  streak: number;
  points: number;
  focusMinutes: number;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  const bob = useEaseLoop(2200, !reduceMotion);
  const flame = {
    transform: [
      { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) },
      { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ["-4deg", "4deg"] }) },
    ],
  };

  return (
    <View style={styles.statStrip} accessibilityRole="summary">
      <View style={styles.statCell}>
        <View style={styles.statValueRow}>
          <Animated.View style={flame}>
            <StreakFlameMark size={15} />
          </Animated.View>
          <Text style={td(T.h2, { fontSize: 19, letterSpacing: -0.57, lineHeight: 19, color: theme.home.streakInk })}>
            {streak}
          </Text>
        </View>
        <Text style={td(T.badge, { fontSize: 10, letterSpacing: 0.8, color: theme.home.subtle })}>DAY STREAK</Text>
      </View>

      <View style={styles.statDivider} />

      <View style={styles.statCell}>
        <View style={styles.statValueRow}>
          <XpIcon size={14} stroke={theme.home.statBoltStroke} strokeWidth={1.6} />
          <Text style={td(T.h2, { fontSize: 19, letterSpacing: -0.57, lineHeight: 19, color: theme.home.pointsInk })}>
            {points}
          </Text>
        </View>
        <Text style={td(T.badge, { fontSize: 10, letterSpacing: 0.8, color: theme.home.subtle })}>POINTS TODAY</Text>
      </View>

      <View style={styles.statDivider} />

      <View style={styles.statCell}>
        <View style={styles.statMinutesRow}>
          <Text style={td(T.h2, { fontSize: 19, letterSpacing: -0.57, lineHeight: 19, color: theme.home.focusedInk })}>
            {focusMinutes}
          </Text>
          <Text style={td(T.badge, { fontSize: 12, letterSpacing: 0, color: theme.home.focusedInk })}>min</Text>
        </View>
        <Text style={td(T.badge, { fontSize: 10, letterSpacing: 0.8, color: theme.home.subtle })}>FOCUSED</Text>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- headers */

/** LABEL — rule — optional trailing control. The shape every section on Home starts with. */
export function HomeRuleHeader({
  label,
  ink,
  gap = 9,
  style,
  leading,
  trailing,
}: {
  label: string;
  ink: string;
  gap?: number;
  style?: object;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.ruleHeader, { gap }, style]}>
      <Text numberOfLines={1} style={td(T.eyebrow, { fontSize: 11, letterSpacing: 1.32, color: ink })}>
        {label}
      </Text>
      {leading}
      <View style={styles.rule} />
      {trailing}
    </View>
  );
}

/**
 * The + that makes a goal. Its own component rather than part of the header, because the
 * walkthrough points at this button specifically and has to be able to wrap it.
 */
export function GoalsAddButton({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="New goal" onPress={onPress} style={styles.plusButton}>
      <PlusMark size={15} />
    </Pressable>
  );
}

/** TO DO / DONE: the label, how many, and the control that folds the section away. */
export function HomeListHeader({
  label,
  ink,
  count,
  countBg,
  countInk,
  collapsed,
  collapsedLabel,
  expandedLabel,
  caret,
  onToggle,
}: {
  label: string;
  ink: string;
  count: number;
  countBg: string;
  countInk: string;
  collapsed: boolean;
  /** Named for what tapping does, not for the state — a bare caret left that as guesswork. */
  collapsedLabel: string;
  expandedLabel: string;
  /**
   * Which way the caret points when the section is open. The design draws To do open with ▾ and
   * Done open with ▴, so the glyph follows the section rather than a rule; it flips when the
   * section closes. The word beside it is what actually says what tapping will do.
   */
  caret: "up" | "down";
  onToggle?: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <HomeRuleHeader
      label={label}
      ink={ink}
      style={styles.listHeader}
      leading={
        <View style={[styles.countPill, { backgroundColor: countBg }]}>
          <Text style={td(T.badge, { fontSize: 11, letterSpacing: 0, color: countInk })}>{count}</Text>
        </View>
      }
      trailing={
        onToggle ? (
          <Pressable
            accessibilityRole="button"
            // A 25px pill; this brings its tap area to about the 44px a finger needs.
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityState={{ expanded: !collapsed }}
            accessibilityLabel={`${label}, ${count} items, ${collapsed ? "collapsed" : "expanded"}`}
            onPress={onToggle}
            style={styles.togglePill}
          >
            <Text style={td(T.meta, { fontSize: 11, fontWeight: "700", letterSpacing: 0.66, color: theme.color.textMuted })}>
              {collapsed ? collapsedLabel : expandedLabel}
            </Text>
            <Text style={td(T.badge, { fontSize: 9, letterSpacing: 0, lineHeight: 9, color: theme.home.caret })}>
              {(caret === "down") !== collapsed ? "▾" : "▴"}
            </Text>
          </Pressable>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------ goals */

const GOAL_RING_R = 19;
const GOAL_RING_C = 2 * Math.PI * GOAL_RING_R;

/** Goal tile — a ring of the goal's own colour, its name, and the days behind the percentage. */
export function GoalRingCard({ goal, width, onPress }: { goal: GoalDto; width?: number; onPress?: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const accent = goal.color ?? theme.color.goal;
  const ring = theme.goalRing(accent);
  const pct = goal.targetDays ? Math.min(100, (goal.totalDaysActive / goal.targetDays) * 100) : 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${goal.name}, ${goal.totalDaysActive} of ${goal.targetDays} days`}
      style={[styles.goalCard, width != null ? { width } : { flex: 1 }]}
    >
      <View style={styles.goalRing}>
        <Svg width={46} height={46} viewBox="0 0 46 46" style={StyleSheet.absoluteFill}>
          <Circle cx={23} cy={23} r={GOAL_RING_R} fill="none" stroke={ring.track} strokeWidth={5} />
          <Circle
            cx={23}
            cy={23}
            r={GOAL_RING_R}
            fill="none"
            stroke={accent}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={GOAL_RING_C}
            strokeDashoffset={GOAL_RING_C * (1 - pct / 100)}
            // Starts the arc at twelve o'clock rather than at three.
            transform="rotate(-90 23 23)"
          />
        </Svg>
        {/* "100%" is a digit wider than the ring's inside at 12px and was clipped to "l00%" — the only
            three-digit value, so it alone steps down. */}
        <Text style={td(T.badge, { fontSize: Math.round(pct) >= 100 ? 10 : 12, letterSpacing: 0, color: ring.ink })}>
          {Math.round(pct)}%
        </Text>
      </View>
      <View style={styles.goalText}>
        <Text style={td(T.body, { fontSize: 15, fontWeight: "800", color: theme.color.text })} numberOfLines={2}>
          {goal.name}
        </Text>
        <Text style={td(T.meta, { fontSize: 12, fontWeight: "700", color: theme.home.subtle, marginTop: 2 })}>
          {goal.totalDaysActive} of {goal.targetDays} days
        </Text>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------- rows */

/**
 * What a row is, which decides its mark, its colour and the word its meta line opens with.
 *
 * "goal" wins over the others when a task counts toward one — that's the thing worth seeing at a
 * glance — and "task" is a plain to-do: a reminder-type task with no notification set.
 */
export type HomeRowKind = "focus" | "reminder" | "task" | "goal";

const kindsFor = (t: Tokens): Record<HomeRowKind, { label: string; ink: string; tile: string; mark: React.ReactNode }> => ({
  focus: {
    label: "Focus",
    ink: t.color.taskTypeFocusFg,
    tile: t.color.taskTypeFocusBg,
    mark: <GoalTargetIcon size={19} />,
  },
  reminder: {
    label: "Reminder",
    ink: t.color.taskTypeReminderFg,
    tile: t.color.taskTypeReminderBg,
    mark: <ReminderBellMark size={19} />,
  },
  task: {
    label: "Task",
    ink: t.color.taskTypeReminderFg,
    tile: t.color.taskTypeReminderBg,
    mark: <EnvelopeMark size={19} />,
  },
  goal: {
    label: "Goal",
    ink: t.home.goalKindInk,
    tile: t.home.goalKindBg,
    mark: <DoneCheckIcon size={19} />,
  },
});

/** An open row: what it is, what it's worth, and the one thing to do with it. */
export function HomeTaskRow({
  kind,
  title,
  detail,
  points = 0,
  actionLabel,
  actionTone = "primary",
  detailTone = "default",
  titleAdornment,
  showPoints = true,
  onPress,
  onAction,
}: {
  kind: HomeRowKind;
  title: string;
  /** Follows the kind on the meta line — the goal's name, a time, a session length. */
  detail?: string | null;
  /** What finishing it will earn. Not needed when `showPoints` is off. */
  points?: number;
  actionLabel: string;
  /**
   * How much the action should ask for. "primary" is the filled button Home uses, where
   * Focus and Done are the things you came to do. "quiet" is an outline, for an action that
   * should be available without being recommended - Scheduled's Cancel destroys a task, and
   * a column of filled buttons there reads as an instruction to delete things.
   */
  actionTone?: "primary" | "quiet";
  /** "danger" for a routine whose next occurrence has already slipped. */
  detailTone?: "default" | "danger";
  /**
   * Sits immediately after the title. The repeat glyph goes here rather than in the tile,
   * so a routine keeps the colourful mark that says what kind of task it is - the tile is
   * how you tell a focus task from a reminder at a glance, and spending it on "this comes
   * back" made every routine look alike.
   */
  titleAdornment?: React.ReactNode;
  /**
   * Off on the Scheduled screen. "+25" says what finishing earns, which is motivating next to
   * today's work and merely noisy next to something due a week from now - and stacked down a
   * column of routines it crowds out the thing the row is actually for.
   */
  showPoints?: boolean;
  onPress: () => void;
  onAction: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const k = kindsFor(theme)[kind];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.row}>
      <View style={[styles.rowTile, { backgroundColor: k.tile }]}>{k.mark}</View>
      <View style={styles.rowText}>
        <View style={styles.rowTitleLine}>
          {/*
            No numberOfLines here. A long title wraps onto a second line rather than being cut
            off - clipping it to make room for the adornment traded every row in the app for a
            glyph only the Scheduled screen uses. HOME-12 is about the wrapping, and VIS-04
            caught the change because the test only asserts the button isn't pushed off.
          */}
          <Text style={[td(T.bodyLg, { color: theme.color.text }), styles.rowTitleText]}>{title}</Text>
          {titleAdornment}
        </View>
        <View style={styles.rowMeta}>
          <Text
            style={td(T.meta, {
              fontSize: 12,
              fontWeight: "700",
              color: detailTone === "danger" ? theme.color.danger : k.ink,
            })}
            numberOfLines={2}
          >
            {k.label}
            {detail ? `${k.label ? " · " : ""}${detail}` : ""}
          </Text>
          {showPoints ? (
            <View style={styles.xpTag}>
              <XpIcon size={11} />
              <Text style={td(T.badge, { fontSize: 11, letterSpacing: 0, color: theme.home.xpInk })}>+{points}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel}: ${title}`}
        style={[styles.rowAction, actionTone === "quiet" && styles.rowActionQuiet]}
      >
        <Text
          style={td(T.label, {
            fontSize: 14,
            fontWeight: "700",
            color: actionTone === "quiet" ? theme.color.danger : theme.home.actionInk,
          })}
        >
          {actionLabel}
        </Text>
      </Pressable>
    </Pressable>
  );
}

/** A finished row: struck through, with the time it was finished and what it earned. */
export function HomeDoneRow({
  kind,
  title,
  detail,
  finishedAt,
  points,
  onPress,
}: {
  kind: HomeRowKind;
  title: string;
  detail?: string | null;
  /** Clock time it was finished, already formatted. */
  finishedAt: string | null;
  /** Null for a task finished before it could earn anything — shown as no pill rather than "+0". */
  points: number | null;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const meta = [kindsFor(theme)[kind].label, detail, finishedAt].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={styles.doneRow}
    >
      <View style={styles.doneTile}>
        <DoneTickMark size={19} color={theme.home.doneTick} />
      </View>
      <View style={styles.rowText}>
        <Text
          style={td(T.bodyLg, {
            color: theme.home.doneTitle,
            textDecorationLine: "line-through",
            textDecorationColor: theme.home.doneStrike,
          })}
        >
          {title}
        </Text>
        <Text
          style={td(T.meta, {
            fontSize: 12,
            fontWeight: "700",
            marginTop: 3,
            color: kind === "goal" ? theme.home.doneMetaGoal : theme.home.doneMeta,
          })}
        >
          {meta}
        </Text>
      </View>
      {points != null && points > 0 ? (
        <View style={styles.donePill}>
          <XpIcon size={11} strokeWidth={1.6} />
          <Text style={td(T.badge, { fontSize: 11, letterSpacing: 0, color: theme.home.donePillInk })}>+{points}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Nothing open — the same card shape as a row, so the list doesn't lose its rhythm. */
export function HomeEmptyRow({ title, body }: { title: string; body: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.row, styles.emptyRow]}>
      <View style={styles.rowText}>
        <Text style={td(T.bodyLg, { color: theme.color.text })}>{title}</Text>
        <Text style={td(T.meta, { fontSize: 12, fontWeight: "700", color: theme.home.subtle, marginTop: 3 })}>{body}</Text>
      </View>
    </View>
  );
}

/** Closes the list, so the screen reads finished rather than cut off. */
export function HomeClosingLine({ children }: { children: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={[styles.closingLine, td(T.meta, { fontSize: 12, color: theme.home.closingLine })]}>{children}</Text>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    statStrip: {
      marginTop: 14,
      flexDirection: "row",
      alignItems: "center",
    },
    statCell: {
      flex: 1,
      gap: 3,
      // Each figure sits over the middle of its own label rather than ragged-left against the
      // divider, so the three read as one evenly-spaced strip.
      alignItems: "center",
    },
    statValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    statMinutesRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 3,
    },
    statDivider: {
      width: 1,
      height: px(32),
      backgroundColor: t.home.statDivider,
    },
    ruleHeader: {
      flexDirection: "row",
      alignItems: "center",
    },
    rule: {
      flex: 1,
      height: 1,
      backgroundColor: t.color.border,
    },
    listHeader: {
      marginTop: 18,
      marginBottom: 9,
      // The design's header row is exactly as tall as its pill — 25px. This was 28, three pixels a
      // header that pushed everything below TO DO and DONE out of step with the drawing (VIS-01).
      // The pill's tap area comes from hitSlop instead, which is what it needed anyway.
      minHeight: 25,
    },
    plusButton: {
      width: px(28),
      height: px(28),
      borderRadius: 9,
      backgroundColor: t.color.card,
      borderWidth: 1,
      borderColor: t.color.border,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    countPill: {
      borderRadius: 7,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    togglePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingTop: 5,
      paddingBottom: 5,
      paddingLeft: 10,
      paddingRight: 6,
      borderRadius: 9,
      backgroundColor: t.color.card,
      borderWidth: 1,
      borderColor: t.color.border,
      // The rule beside it is flex:1 and would otherwise squeeze "Collapse all" onto two lines.
      flexShrink: 0,
    },
    goalCard: {
      minWidth: 0,
      backgroundColor: t.color.card,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: 14,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },
    goalRing: {
      width: px(46),
      height: px(46),
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    goalText: {
      flex: 1,
      minWidth: 0,
    },
    row: {
      backgroundColor: t.color.card,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: 12,
      padding: 11,
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },
    emptyRow: {
      minHeight: 0,
    },
    rowTile: {
      width: px(36),
      height: px(36),
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    rowMeta: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 3,
    },
    xpTag: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
    /** Shrinks so a wrapping title keeps the adornment beside it rather than pushing it out. */
    rowTitleText: { flexShrink: 1 },
    rowAction: {
      backgroundColor: t.home.actionBg,
      borderRadius: 10,
      paddingVertical: 11,
      paddingHorizontal: 15,
    },
    /** Outline rather than filled: reachable, but not the thing the row is recommending. */
    rowActionQuiet: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: t.color.danger,
    },
    doneRow: {
      backgroundColor: t.home.doneBg,
      borderWidth: 1,
      borderColor: t.home.doneBorder,
      borderRadius: 12,
      padding: 11,
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },
    doneTile: {
      width: px(36),
      height: px(36),
      borderRadius: 10,
      backgroundColor: t.home.doneTileBg,
      borderWidth: 1,
      borderColor: t.home.doneTileBorder,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    donePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      flexShrink: 0,
      backgroundColor: t.home.donePillBg,
      borderRadius: 9,
      paddingVertical: 6,
      paddingHorizontal: 9,
    },
    closingLine: {
      textAlign: "center",
      paddingTop: 14,
      paddingBottom: 2,
    },
  });
