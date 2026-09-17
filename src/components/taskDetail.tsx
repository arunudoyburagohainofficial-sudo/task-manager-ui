/**
 * Task Detail's blocks, transcribed from the Task Detail Elegant screens.
 *
 * A quieter register than the rest of the app: soft white cards on 22pt radii with one hairline
 * shadow, a deeper ink, and a terracotta that leans brown. The tokens live in `theme.detail`;
 * sizes go through `textAtDesignSize`, because these screens — like the Home ones — are drawn at
 * a phone's own size and the app-wide 10% trim would make them smaller than the design asks.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { color, detail, textAtDesignSize as td, type as T } from "../theme";
import { GradientFill } from "./ScreenWash";
import {
  AttachPlusIcon,
  BackChevronIcon,
  FocusIcon,
  ReminderIcon,
  RowChevronIcon,
  StreakIcon,
} from "./icons";

/**
 * "today makes five" reads as encouragement in a way "today makes 5" doesn't — the design
 * spells it, so this does too, up to the point where words stop being shorter than digits.
 */
const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];

function spellOut(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** One hairline shadow under every card on this screen. */
const CARD_SHADOW = [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: detail.cardShadow }];

/* ----------------------------------------------------------------- header */

/**
 * Back, and the overflow dots the design puts opposite it. The dots carry the destructive
 * action so they aren't decoration — "Delete task" also sits at the foot of the page, which is
 * where someone reading down the screen will find it.
 */
export function DetailHeader({ onBack, onMenu }: { onBack: () => void; onMenu?: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={12}
        style={styles.headerHit}
      >
        <BackChevronIcon size={26} />
      </Pressable>
      {onMenu ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More actions"
          onPress={onMenu}
          hitSlop={14}
          style={styles.dots}
        >
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function DetailTitle({ children }: { children: string }) {
  return (
    <Text style={td(T.h1, { fontSize: 27, fontWeight: "700", lineHeight: 32, letterSpacing: -0.86, color: detail.ink })}>
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------ type switch */

/** Focus / Reminder. The switch that decides what the rest of the screen even offers. */
export function TaskTypeSwitch({
  value,
  onChange,
}: {
  value: "focus" | "reminder";
  onChange: (next: "focus" | "reminder") => void;
}) {
  const item = (kind: "focus" | "reminder", label: string) => {
    const active = value === kind;
    return (
      <Pressable
        key={kind}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
        onPress={() => onChange(kind)}
        style={[styles.switchItem, active && styles.switchItemActive]}
      >
        <View style={active ? undefined : styles.switchIconIdle}>
          {kind === "focus" ? <FocusIcon size={15} /> : <ReminderIcon size={15} />}
        </View>
        <Text
          style={td(T.body, {
            fontSize: 13.5,
            fontWeight: active ? "700" : "600",
            color: active ? detail.ink : detail.muted,
          })}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.switchTrack}>
      {item("focus", "Focus")}
      {item("reminder", "Reminder")}
    </View>
  );
}

/* --------------------------------------------------------------- sections */

export function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={[styles.sectionLabel, td(T.eyebrow, { fontSize: 11, fontWeight: "700", letterSpacing: 1.54, color: detail.label })]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function DetailCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/* ------------------------------------------------------------------ goal */

const GOAL_RING_R = 19.5;
const GOAL_RING_C = 2 * Math.PI * GOAL_RING_R;

/**
 * The goal a focus task counts toward, or the invitation to attach one.
 *
 * `todayCounts` is what turns the ring into a nudge: when today hasn't been counted yet,
 * finishing this task is the thing that moves it, and the line says so.
 */
export function GoalAttachmentCard({
  goalName,
  daysDone,
  targetDays,
  todayCounts,
  onPress,
}: {
  goalName: string | null;
  daysDone: number;
  targetDays: number;
  todayCounts: boolean;
  onPress: () => void;
}) {
  const attached = goalName != null;
  const progress = targetDays > 0 ? Math.min(1, daysDone / targetDays) : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        attached ? `Goal: ${goalName}, ${daysDone} of ${targetDays} days. Change` : "Attach a goal"
      }
      onPress={onPress}
      style={[styles.card, styles.goalCard]}
    >
      {attached ? (
        <View style={styles.goalRing}>
          <Svg width={46} height={46} viewBox="0 0 46 46">
            <Circle cx={23} cy={23} r={GOAL_RING_R} fill="none" stroke={detail.goalTrack} strokeWidth={4} />
            {progress > 0 ? (
              <Circle
                cx={23}
                cy={23}
                r={GOAL_RING_R}
                fill="none"
                stroke={detail.goalArc}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray={GOAL_RING_C}
                strokeDashoffset={GOAL_RING_C * (1 - progress)}
                transform="rotate(-90 23 23)"
              />
            ) : null}
          </Svg>
          <View style={styles.goalRingLabel}>
            <Text style={td(T.label, { fontSize: 14, fontWeight: "700", color: detail.goalInk })}>{daysDone}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.goalEmptyRing}>
          <AttachPlusIcon size={17} />
        </View>
      )}

      <View style={styles.goalText}>
        <Text
          numberOfLines={1}
          style={td(T.body, { fontSize: 15.5, fontWeight: "700", letterSpacing: -0.16, color: detail.ink })}
        >
          {attached ? goalName : "No goal attached"}
        </Text>
        <Text style={td(T.meta, { fontSize: 12.5, fontWeight: "500", color: detail.muted, marginTop: 3 })}>
          {attached
            ? `${daysDone} of ${targetDays} days${todayCounts ? ` · today makes ${spellOut(daysDone + 1)}` : ""}`
            : "Optional — link it to a goal"}
        </Text>
      </View>

      {attached ? (
        <RowChevronIcon size={16} />
      ) : (
        <Text style={[styles.goalAction, td(T.meta, { fontSize: 13, fontWeight: "600", color: detail.action })]}>
          Attach
        </Text>
      )}
    </Pressable>
  );
}

/* --------------------------------------------------------------- session */

/** Regular / Pomodoro — the one switch in the app with a dark active state. */
export function SessionModeSwitch({
  value,
  onChange,
}: {
  value: "regular" | "pomodoro";
  onChange: (next: "regular" | "pomodoro") => void;
}) {
  const item = (mode: "regular" | "pomodoro", label: string) => {
    const active = value === mode;
    return (
      <Pressable
        key={mode}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
        onPress={() => onChange(mode)}
        style={[styles.modeItem, active && styles.modeItemActive]}
      >
        <Text
          style={td(T.body, {
            fontSize: 13,
            fontWeight: active ? "700" : "600",
            color: active ? detail.modeActiveInk : detail.muted,
          })}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.modeTrack}>
      {item("regular", "Regular")}
      {item("pomodoro", "Pomodoro")}
    </View>
  );
}

/** The round − / + pair. `compact` is the smaller pair inside a Pomodoro tile. */
function StepperPair({
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
  label,
  compact,
}: {
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
  label: string;
  compact?: boolean;
}) {
  const button = (dir: "down" | "up", enabled: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dir === "down" ? "Decrease" : "Increase"} ${label}`}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={6}
      style={[compact ? styles.stepCompact : styles.step, !enabled && styles.stepDisabled]}
    >
      <Text
        style={td(T.body, {
          fontSize: compact ? 15 : 19,
          fontWeight: "400",
          lineHeight: compact ? 17 : 21,
          color: detail.stepperInk,
        })}
      >
        {dir === "down" ? "−" : "+"}
      </Text>
    </Pressable>
  );

  return (
    <View style={compact ? styles.stepRowCompact : styles.stepRow}>
      {button("down", canDecrease, onDecrease)}
      {button("up", canIncrease, onIncrease)}
    </View>
  );
}

/** LENGTH — how long a regular sitting runs. */
export function SessionLength({
  minutes,
  onChange,
  min = 5,
  max = 90,
  step = 5,
}: {
  minutes: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <View style={styles.lengthRow}>
      <View>
        <Text style={td(T.eyebrow, { fontSize: 11, fontWeight: "700", letterSpacing: 1.32, color: detail.label })}>
          LENGTH
        </Text>
        <View style={styles.lengthValue}>
          <Text style={td(T.timer, { fontSize: 34, fontWeight: "700", letterSpacing: -1.19, lineHeight: 34, color: detail.ink })}>
            {minutes}
          </Text>
          <Text style={td(T.meta, { fontSize: 13, fontWeight: "600", color: detail.muted })}>min</Text>
        </View>
      </View>
      <StepperPair
        label="session length"
        canDecrease={minutes > min}
        canIncrease={minutes < max}
        onDecrease={() => onChange(Math.max(min, minutes - step))}
        onIncrease={() => onChange(Math.min(max, minutes + step))}
      />
    </View>
  );
}

/** A Pomodoro sitting: how long each round runs, and how many of them. */
export function PomodoroPlan({
  minutes,
  rounds,
  breakMinutes,
  onMinutes,
  onRounds,
}: {
  minutes: number;
  rounds: number;
  breakMinutes: number;
  onMinutes: (next: number) => void;
  onRounds: (next: number) => void;
}) {
  const total = rounds * minutes + Math.max(0, rounds - 1) * breakMinutes;

  return (
    <View>
      <View style={styles.tileRow}>
        <View style={styles.tile}>
          <Text style={td(T.eyebrow, { fontSize: 11, fontWeight: "700", letterSpacing: 1.32, color: detail.label })}>
            EACH ROUND
          </Text>
          <View style={styles.tileValueRow}>
            <View style={styles.tileValue}>
              <Text style={td(T.h1, { fontSize: 26, fontWeight: "700", letterSpacing: -0.78, lineHeight: 26, color: detail.ink })}>
                {minutes}
              </Text>
              <Text style={td(T.meta, { fontSize: 11.5, fontWeight: "600", color: detail.muted })}>min</Text>
            </View>
            <StepperPair
              compact
              label="round length"
              canDecrease={minutes > 5}
              canIncrease={minutes < 60}
              onDecrease={() => onMinutes(Math.max(5, minutes - 5))}
              onIncrease={() => onMinutes(Math.min(60, minutes + 5))}
            />
          </View>
        </View>

        <View style={styles.tile}>
          <Text style={td(T.eyebrow, { fontSize: 11, fontWeight: "700", letterSpacing: 1.32, color: detail.label })}>
            ROUNDS
          </Text>
          <View style={styles.tileValueRow}>
            <Text style={td(T.h1, { fontSize: 26, fontWeight: "700", letterSpacing: -0.78, lineHeight: 26, color: detail.ink })}>
              {rounds}
            </Text>
            <StepperPair
              compact
              label="rounds"
              canDecrease={rounds > 1}
              canIncrease={rounds < 10}
              onDecrease={() => onRounds(Math.max(1, rounds - 1))}
              onIncrease={() => onRounds(Math.min(10, rounds + 1))}
            />
          </View>
        </View>
      </View>

      {/* The sitting drawn as it will run: work, break, work — so the shape of the next
          hour is visible without reading the line under it. */}
      <View style={styles.roundBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: rounds * 2 - 1 }, (_, i) =>
          i % 2 === 0 ? (
            <View key={i} style={[styles.roundSegment, styles.roundWork]} />
          ) : (
            <View key={i} style={[styles.roundSegment, styles.roundBreak]} />
          )
        )}
      </View>

      <Text style={td(T.meta, { fontSize: 12, fontWeight: "500", color: detail.muted, marginTop: 9 })}>
        {rounds} × {minutes} min, {breakMinutes} min breaks · {total} min total
      </Text>
    </View>
  );
}

/* ---------------------------------------------------------------- timing */

/** One line of the TIMING card: what it is, what it's set to, and the word that changes it. */
export function TimingRow({
  icon,
  label,
  value,
  action,
  onPress,
  first,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Omitted on a finished task, where changing it couldn't do anything. */
  action?: string;
  onPress?: () => void;
  first?: boolean;
}) {
  return (
    <View>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={onPress ? `${label}: ${value}. ${action}` : `${label}: ${value}`}
        onPress={onPress}
        disabled={!onPress}
        style={styles.timingRow}
      >
        <View style={styles.timingIcon}>{icon}</View>
        <View style={styles.timingText}>
          <Text style={td(T.eyebrow, { fontSize: 11, fontWeight: "700", letterSpacing: 1.32, color: detail.label })}>
            {label}
          </Text>
          <Text
            numberOfLines={2}
            style={td(T.body, { fontSize: 15, fontWeight: "700", color: detail.ink, marginTop: 4 })}
          >
            {value}
          </Text>
        </View>
        {action ? (
          <Text style={td(T.meta, { fontSize: 13, fontWeight: "600", color: detail.action })}>{action}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

/* ----------------------------------------------------------------- notes */

/** What finishing a focus session is worth — stated as a fact, not dressed as a panel. */
export function StreakNote({ children }: { children: string }) {
  return (
    <View style={styles.note}>
      <View style={styles.noteIcon}>
        <StreakIcon size={15} />
      </View>
      <Text style={td(T.meta, { fontSize: 12, fontWeight: "500", lineHeight: 18, color: detail.muted })}>
        {children}
      </Text>
    </View>
  );
}

/** Why a reminder has no goal, no length and no streak — asked and answered in place. */
export function WhyNoGoalCard() {
  return (
    <View style={styles.explainer}>
      <Text style={td(T.eyebrow, { fontSize: 11, fontWeight: "700", letterSpacing: 1.54, color: detail.label })}>
        WHY THERE IS NO GOAL HERE
      </Text>
      <Text
        style={td(T.meta, {
          fontSize: 12.5,
          fontWeight: "500",
          lineHeight: 19,
          color: detail.explainerInk,
          marginTop: 8,
        })}
      >
        A reminder only buzzes. It never runs a session, so it has no length, no goal to attach, and it adds nothing
        to your streak or weekly progress — those track focused work only.
      </Text>
    </View>
  );
}

export function DeleteTaskLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Delete task" onPress={onPress} style={styles.deleteWrap}>
      <Text style={td(T.meta, { fontSize: 13, fontWeight: "600", color: color.danger })}>Delete task</Text>
    </Pressable>
  );
}

/* ---------------------------------------------------------------- footer */

/**
 * The one action the screen is for, pinned to the bottom over a fade — so a long page scrolls
 * under it rather than hiding it.
 */
export function DetailFooter({
  label,
  tone,
  onPress,
  disabled,
}: {
  label: string;
  tone: "start" | "done";
  onPress: () => void;
  disabled?: boolean;
}) {
  const start = tone === "start";
  return (
    <View style={styles.footer}>
      <GradientFill
        angle={0}
        colors={[
          { offset: 0, color: "rgba(253,248,234,.98)" },
          { offset: 0.62, color: "rgba(253,248,234,.98)" },
          { offset: 1, color: "rgba(253,248,234,0)" },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.footerButton,
          {
            backgroundColor: start ? detail.primary : detail.dark,
            boxShadow: [
              {
                offsetX: 0,
                offsetY: 10,
                blurRadius: 22,
                spreadDistance: start ? -10 : -12,
                color: start ? detail.primaryShadow : detail.darkShadow,
              },
            ],
          },
          disabled && styles.footerButtonDisabled,
        ]}
      >
        <Text
          style={td(T.button, {
            fontSize: 15,
            fontWeight: "700",
            letterSpacing: 0.15,
            color: start ? detail.primaryInk : detail.darkInk,
          })}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 14,
    paddingHorizontal: 20,
  },
  headerHit: {
    marginLeft: -2,
  },
  dots: {
    flexDirection: "row",
    gap: 3.5,
    alignItems: "center",
    paddingVertical: 8,
  },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: detail.dots,
  },
  sectionLabel: {
    paddingLeft: 3,
    paddingRight: 3,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: color.card,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 17,
    boxShadow: CARD_SHADOW,
  },
  switchTrack: {
    flexDirection: "row",
    gap: 5,
    marginTop: 12,
    padding: 3,
    backgroundColor: detail.switchTrack,
    borderRadius: 999,
  },
  switchItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 999,
  },
  switchItemActive: {
    backgroundColor: detail.switchActive,
    boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: detail.switchActiveShadow }],
  },
  /** The unselected side's mark is dimmed rather than recoloured — same sticker, less voice. */
  switchIconIdle: {
    opacity: 0.55,
  },
  goalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  goalRing: {
    width: 46,
    height: 46,
    flexShrink: 0,
  },
  goalRingLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  goalEmptyRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: detail.emptyRing,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  goalText: {
    flex: 1,
    minWidth: 0,
  },
  /** Never squeezed by a long goal name — the word that says what tapping does stays whole. */
  goalAction: {
    flexShrink: 0,
  },
  modeTrack: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    backgroundColor: detail.modeTrack,
    borderRadius: 999,
  },
  modeItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 999,
  },
  modeItemActive: {
    backgroundColor: detail.modeActive,
  },
  lengthRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 18,
  },
  lengthValue: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    marginTop: 4,
  },
  stepRow: {
    flexDirection: "row",
    gap: 8,
  },
  stepRowCompact: {
    flexDirection: "row",
    gap: 5,
  },
  step: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: detail.stepperBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCompact: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: detail.stepperBorder,
    backgroundColor: color.card,
    alignItems: "center",
    justifyContent: "center",
  },
  /** At the end of its range rather than broken — the button stays in place and stops responding. */
  stepDisabled: {
    opacity: 0.4,
  },
  tileRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: detail.tile,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  tileValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 6,
  },
  tileValue: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  roundBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 15,
  },
  roundSegment: {
    height: 8,
    borderRadius: 99,
  },
  roundWork: {
    flex: 5,
    backgroundColor: detail.roundOn,
  },
  roundBreak: {
    flex: 1,
    backgroundColor: detail.roundOff,
  },
  divider: {
    height: 1,
    backgroundColor: detail.divider,
  },
  timingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 13,
  },
  timingIcon: {
    flexShrink: 0,
  },
  timingText: {
    flex: 1,
    minWidth: 0,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingHorizontal: 4,
  },
  noteIcon: {
    flexShrink: 0,
    marginTop: 2,
  },
  explainer: {
    backgroundColor: detail.explainer,
    borderRadius: 22,
    paddingVertical: 15,
    paddingHorizontal: 17,
  },
  deleteWrap: {
    alignItems: "center",
    paddingTop: 2,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 26,
  },
  footerButton: {
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: "center",
  },
  footerButtonDisabled: {
    opacity: 0.6,
  },
});
