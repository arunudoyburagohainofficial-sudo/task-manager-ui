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
import { color, goalRing, home, textAtDesignSize as td, type as T } from "../theme";
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
          <Text style={td(T.h2, { fontSize: 19, letterSpacing: -0.57, lineHeight: 19, color: home.streakInk })}>
            {streak}
          </Text>
        </View>
        <Text style={td(T.badge, { fontSize: 10, letterSpacing: 0.8, color: home.subtle })}>DAY STREAK</Text>
      </View>

      <View style={styles.statDivider} />

      <View style={[styles.statCell, styles.statCellInset]}>
        <View style={styles.statValueRow}>
          <XpIcon size={14} stroke={home.statBoltStroke} strokeWidth={1.6} />
          <Text style={td(T.h2, { fontSize: 19, letterSpacing: -0.57, lineHeight: 19, color: home.pointsInk })}>
            {points}
          </Text>
        </View>
        <Text style={td(T.badge, { fontSize: 10, letterSpacing: 0.8, color: home.subtle })}>POINTS TODAY</Text>
      </View>

      <View style={styles.statDivider} />

      <View style={[styles.statCell, styles.statCellInset]}>
        <View style={styles.statMinutesRow}>
          <Text style={td(T.h2, { fontSize: 19, letterSpacing: -0.57, lineHeight: 19, color: home.focusedInk })}>
            {focusMinutes}
          </Text>
          <Text style={td(T.badge, { fontSize: 12, letterSpacing: 0, color: home.focusedInk })}>min</Text>
        </View>
        <Text style={td(T.badge, { fontSize: 10, letterSpacing: 0.8, color: home.subtle })}>FOCUSED</Text>
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
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="New goal" onPress={onPress} style={styles.plusButton}>
      <PlusMark size={15} />
    </Pressable>
  );
}

export function RightNowHeader() {
  return <HomeRuleHeader label="RIGHT NOW" ink={color.textLabel} gap={10} style={styles.rightNowHeader} />;
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
            accessibilityState={{ expanded: !collapsed }}
            accessibilityLabel={`${label}, ${count} items, ${collapsed ? "collapsed" : "expanded"}`}
            onPress={onToggle}
            style={styles.togglePill}
          >
            <Text style={td(T.meta, { fontSize: 11, fontWeight: "700", letterSpacing: 0.66, color: color.textMuted })}>
              {collapsed ? collapsedLabel : expandedLabel}
            </Text>
            <Text style={td(T.badge, { fontSize: 9, letterSpacing: 0, lineHeight: 9, color: home.caret })}>
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
  const accent = goal.color ?? color.goal;
  const ring = goalRing(accent);
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
        <Text style={td(T.badge, { fontSize: 12, letterSpacing: 0, color: ring.ink })}>{Math.round(pct)}%</Text>
      </View>
      <View style={styles.goalText}>
        <Text style={td(T.body, { fontSize: 15, fontWeight: "800", color: color.text })} numberOfLines={2}>
          {goal.name}
        </Text>
        <Text style={td(T.meta, { fontSize: 12, fontWeight: "700", color: home.subtle, marginTop: 2 })}>
          {goal.totalDaysActive} of {goal.targetDays} days
        </Text>
      </View>
    </Pressable>
  );
}

/* -------------------------------------------------------------- right now */

const SESSION_RING_R = 22;
const SESSION_RING_C = 2 * Math.PI * SESSION_RING_R;

/**
 * The session actually running, lifted out of the list.
 *
 * Exists only while something is running — there is no empty version of this card, by design.
 * `minutesLeft` null means the session predates the server recording how long it was meant to
 * run, so it shows how long it has been going instead of counting down to a length it can't know.
 */
export function RightNowCard({
  title,
  minutesLeft,
  minutesElapsed,
  plannedMinutes,
  fractionLeft,
  onResume,
}: {
  title: string;
  minutesLeft: number | null;
  minutesElapsed: number;
  plannedMinutes: number | null;
  fractionLeft: number | null;
  onResume: () => void;
}) {
  const finished = minutesLeft === 0;
  const subtitle =
    minutesLeft == null
      ? `Running · ${minutesElapsed} min so far`
      : finished
        ? `Time's up · ${plannedMinutes} min`
        : `${minutesLeft} min left of ${plannedMinutes}`;

  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionRing}>
        <Svg width={48} height={48} viewBox="0 0 52 52" style={StyleSheet.absoluteFill}>
          <Circle cx={26} cy={26} r={SESSION_RING_R} fill="none" stroke={home.sessionTrack} strokeWidth={5} />
          {fractionLeft != null && fractionLeft > 0 ? (
            <Circle
              cx={26}
              cy={26}
              r={SESSION_RING_R}
              fill="none"
              stroke={home.sessionRing}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={SESSION_RING_C}
              // The ring empties as the session runs down, so it reads as time remaining.
              strokeDashoffset={SESSION_RING_C * (1 - fractionLeft)}
              transform="rotate(-90 26 26)"
            />
          ) : null}
        </Svg>
        <Text style={td(T.badge, { fontSize: 13, letterSpacing: 0, color: home.sessionInk })}>
          {minutesLeft ?? minutesElapsed}
        </Text>
      </View>
      <View style={styles.sessionText}>
        <Text style={td(T.bodyLg, { fontWeight: "800", letterSpacing: -0.16, color: color.text })} numberOfLines={1}>
          {title}
        </Text>
        <Text style={td(T.meta, { fontSize: 12, fontWeight: "700", color: home.subtle, marginTop: 2 })}>
          {subtitle}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${finished ? "Finish" : "Resume"}: ${title}`}
        onPress={onResume}
        style={styles.sessionAction}
      >
        <Text style={td(T.label, { fontSize: 14, fontWeight: "700", color: home.actionInk })}>
          {finished ? "Finish" : "Resume"}
        </Text>
      </Pressable>
    </View>
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

const KIND: Record<HomeRowKind, { label: string; ink: string; tile: string; mark: React.ReactNode }> = {
  focus: {
    label: "Focus",
    ink: color.taskTypeFocusFg,
    tile: color.taskTypeFocusBg,
    mark: <GoalTargetIcon size={19} />,
  },
  reminder: {
    label: "Reminder",
    ink: color.taskTypeReminderFg,
    tile: color.taskTypeReminderBg,
    mark: <ReminderBellMark size={19} />,
  },
  task: {
    label: "Task",
    ink: color.taskTypeReminderFg,
    tile: color.taskTypeReminderBg,
    mark: <EnvelopeMark size={19} />,
  },
  goal: {
    label: "Goal",
    ink: home.goalKindInk,
    tile: home.goalKindBg,
    mark: <DoneCheckIcon size={19} />,
  },
};

/** An open row: what it is, what it's worth, and the one thing to do with it. */
export function HomeTaskRow({
  kind,
  title,
  detail,
  points,
  actionLabel,
  onPress,
  onAction,
}: {
  kind: HomeRowKind;
  title: string;
  /** Follows the kind on the meta line — the goal's name, a time, a session length. */
  detail?: string | null;
  /** What finishing it will earn. */
  points: number;
  actionLabel: string;
  onPress: () => void;
  onAction: () => void;
}) {
  const k = KIND[kind];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.row}>
      <View style={[styles.rowTile, { backgroundColor: k.tile }]}>{k.mark}</View>
      <View style={styles.rowText}>
        <Text style={td(T.bodyLg, { color: color.text })}>{title}</Text>
        <View style={styles.rowMeta}>
          <Text style={td(T.meta, { fontSize: 12, fontWeight: "700", color: k.ink })}>
            {k.label}
            {detail ? ` · ${detail}` : ""}
          </Text>
          <View style={styles.xpTag}>
            <XpIcon size={11} />
            <Text style={td(T.badge, { fontSize: 11, letterSpacing: 0, color: home.xpInk })}>+{points}</Text>
          </View>
        </View>
      </View>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel}: ${title}`}
        style={styles.rowAction}
      >
        <Text style={td(T.label, { fontSize: 14, fontWeight: "700", color: home.actionInk })}>{actionLabel}</Text>
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
  const meta = [KIND[kind].label, detail, finishedAt].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={styles.doneRow}
    >
      <View style={styles.doneTile}>
        <DoneTickMark size={19} color={home.doneTick} />
      </View>
      <View style={styles.rowText}>
        <Text
          style={td(T.bodyLg, {
            color: home.doneTitle,
            textDecorationLine: "line-through",
            textDecorationColor: home.doneStrike,
          })}
        >
          {title}
        </Text>
        <Text
          style={td(T.meta, {
            fontSize: 12,
            fontWeight: "700",
            marginTop: 3,
            color: kind === "goal" ? home.doneMetaGoal : home.doneMeta,
          })}
        >
          {meta}
        </Text>
      </View>
      {points != null && points > 0 ? (
        <View style={styles.donePill}>
          <XpIcon size={11} strokeWidth={1.6} />
          <Text style={td(T.badge, { fontSize: 11, letterSpacing: 0, color: home.donePillInk })}>+{points}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Nothing open — the same card shape as a row, so the list doesn't lose its rhythm. */
export function HomeEmptyRow({ title, body }: { title: string; body: string }) {
  return (
    <View style={[styles.row, styles.emptyRow]}>
      <View style={styles.rowText}>
        <Text style={td(T.bodyLg, { color: color.text })}>{title}</Text>
        <Text style={td(T.meta, { fontSize: 12, fontWeight: "700", color: home.subtle, marginTop: 3 })}>{body}</Text>
      </View>
    </View>
  );
}

/** Closes the list, so the screen reads finished rather than cut off. */
export function HomeClosingLine({ children }: { children: string }) {
  return (
    <Text style={[styles.closingLine, td(T.meta, { fontSize: 12, color: home.closingLine })]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  statStrip: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  statCell: {
    flex: 1,
    gap: 3,
  },
  statCellInset: {
    paddingLeft: 14,
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
    height: 32,
    backgroundColor: home.statDivider,
  },
  ruleHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: color.border,
  },
  rightNowHeader: {
    marginTop: 16,
    paddingHorizontal: 2,
  },
  listHeader: {
    marginTop: 18,
    marginBottom: 9,
    minHeight: 28,
  },
  plusButton: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
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
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    // The rule beside it is flex:1 and would otherwise squeeze "Collapse all" onto two lines.
    flexShrink: 0,
  },
  goalCard: {
    minWidth: 0,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  goalRing: {
    width: 46,
    height: 46,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  goalText: {
    flex: 1,
    minWidth: 0,
  },
  sessionCard: {
    marginTop: 7,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: home.cardShadow }],
  },
  sessionRing: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionText: {
    flex: 1,
    minWidth: 0,
  },
  sessionAction: {
    backgroundColor: home.actionBg,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  row: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
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
    width: 36,
    height: 36,
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
  rowAction: {
    backgroundColor: home.actionBg,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 15,
  },
  doneRow: {
    backgroundColor: home.doneBg,
    borderWidth: 1,
    borderColor: home.doneBorder,
    borderRadius: 12,
    padding: 11,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  doneTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: home.doneTileBg,
    borderWidth: 1,
    borderColor: home.doneTileBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  donePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
    backgroundColor: home.donePillBg,
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
