import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type BoxShadowValue } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import type { GoalDto, TaskType } from "../api/types";
import { accentRamp, color, lift, radius, shade, space, text as t, type as T } from "../theme";
import { Card } from "./Card";
import { BellGlyph, TargetGlyph, XpIcon } from "./icons";
import { useReduceMotion } from "./Ferne";
import { GradientFill, InnerShading } from "./ScreenWash";

/**
 * Continuous rotation, native driver. Duration is a full turn; `reverse` runs it backwards
 * so two rings can counter-rotate the way the design has them.
 */
function useSpin(durationMs: number, enabled: boolean, reverse = false) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      v.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: durationMs, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [durationMs, enabled, v]);
  return v.interpolate({ inputRange: [0, 1], outputRange: reverse ? ["360deg", "0deg"] : ["0deg", "360deg"] });
}

/** Ease-in-out 0 → 1 → 0 loop, for the rim's breathing. */
function useLoop(durationMs: number, enabled: boolean) {
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

/**
 * Rounded icon tile for Home's To do / Completed rows — bell for reminder tasks, target
 * for focus, one glyph shape per type recoloured per row state. `completed` collapses both
 * types to the same muted olive tone, since a finished task no longer needs its type to
 * stand out the way an actionable one does.
 */
function TaskTypeTile({ taskType, completed = false, size: d = 32 }: { taskType: TaskType; completed?: boolean; size?: number }) {
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

/**
 * "Focus" / "Reminder", tinted to match the tile — the row's type label under the title.
 * When the task is attached to a goal, the goal's own name follows in its own accent
 * colour, " · "-separated — the same "coloured tag under the title" treatment the type
 * itself gets, so which goal a task counts toward is visible without opening it.
 */
function TaskTypeLabel({
  taskType,
  goalName,
  goalColor,
  detail,
}: {
  taskType: TaskType;
  goalName?: string;
  goalColor?: string;
  /** Reminder time or planned session length — folded into this line rather than given its own. */
  detail?: string | null;
}) {
  const isFocus = taskType === "focus";
  return (
    <Text style={t(T.meta, { fontWeight: "700" })}>
      <Text style={{ color: isFocus ? color.taskTypeFocusFg : color.taskTypeReminderFg }}>
        {isFocus ? "Focus" : "Reminder"}
      </Text>
      {goalName ? (
        <>
          <Text style={{ color: color.textFaint }}> · </Text>
          <Text style={{ color: goalColor ?? color.goal }}>{goalName}</Text>
        </>
      ) : null}
      {detail ? (
        <>
          <Text style={{ color: color.textFaint }}> · </Text>
          <Text style={{ color: color.textMuted }}>{detail}</Text>
        </>
      ) : null}
    </Text>
  );
}

/** Bolt + points, the app's one XP marker. Rendered wherever a points figure appears. */
function XpTag({ points, suffix, tone = "pending" }: { points: number; suffix?: string; tone?: "pending" | "earned" }) {
  return (
    <View style={styles.xpTag}>
      <XpIcon />
      <Text style={t(T.badge, { fontSize: 11, letterSpacing: 0, color: tone === "earned" ? "#7C9436" : "#A9760B" })}>
        +{points}
        {suffix ? ` ${suffix}` : ""}
      </Text>
    </View>
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
      {/* Shrinkable and single-line: on a 320pt screen "COMPLETED TODAY" plus the
          "Collapse all" pill is wider than the row, and without this the eyebrow wraps to
          two lines and takes the whole header with it. Ellipsising one character there is
          the better failure. */}
      <Text
        numberOfLines={1}
        style={[t(T.eyebrow, { fontSize: 11, letterSpacing: 1.32, color: labelColor }), styles.sectionLabel]}
      >
        {label}
      </Text>
      <View style={[styles.countPill, { backgroundColor: countStyle.bg }]}>
        <Text style={t(T.badge, { fontSize: 11, letterSpacing: 0, color: countStyle.fg })}>{count}</Text>
      </View>
      <View style={styles.rule} />
      {onToggle ? (
        <View style={styles.togglePill}>
          {/* Names the action, not the state: a bare chevron left it guesswork whether
              tapping would open the section or close it. */}
          <Text style={t(T.meta, { fontSize: 11, fontWeight: "700", letterSpacing: 0.66, color: color.textMuted })}>
            {collapsed ? "Expand all" : "Collapse all"}
          </Text>
          <Text style={t(T.badge, { fontSize: 9, letterSpacing: 0, color: "#A0A79F" })}>
            {collapsed ? "▸" : "▾"}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * One of the three stat chips along the top of Home.
 *
 * Deliberately a compact strip rather than the tall stacked cards this replaces: those ran
 * ~68px each and pushed the To do list — the part of the screen people actually act on —
 * most of a screen height down. Everything sits on one line here, which costs about half
 * the vertical space and reads just as clearly at a glance.
 *
 * `trailing` exists so the streak chip can keep its info tooltip — the original strip had
 * one, and a redesign shouldn't quietly cost the user an explanation.
 */
/**
 * Per-chip surface, transcribed value-for-value from the design.
 *
 * Each is a three-stop ramp, not two: the mid stop at 58% is what holds the chip pale
 * across its top two-thirds and then turns it over quickly at the bottom, which is the
 * whole reason the shape reads as domed. Interpolating straight from the top colour to the
 * bottom one — what this used to do — spreads that turn evenly over the full height and
 * flattens it into a plain tint.
 *
 * Hoisted to module scope because none of it depends on props: the ramps and their shadow
 * stacks are built once rather than per render.
 */
const CHIP_SURFACE = {
  streak: {
    grad: [
      { offset: 0, color: "#FFF8F2" },
      { offset: 0.58, color: "#FFEADD" },
      { offset: 1, color: "#FBDDCB" },
    ],
    border: "rgba(246,213,194,.9)",
    fg: color.taskTypeFocusFg,
    depth: lift("rgba(180,86,44,.22)", "rgba(198,120,84,.10)"),
  },
  done: {
    grad: [
      { offset: 0, color: "#F8FBEF" },
      { offset: 0.58, color: "#EDF3E0" },
      { offset: 1, color: "#DFEACB" },
    ],
    border: "rgba(220,230,196,.9)",
    fg: "#5F7226",
    depth: lift("rgba(95,114,38,.18)", "rgba(130,152,74,.10)"),
  },
  goals: {
    grad: [
      { offset: 0, color: "#FFFFFF" },
      { offset: 0.58, color: "#FFFCF6" },
      { offset: 1, color: "#F8EFE2" },
    ],
    border: "rgba(237,224,198,.9)",
    fg: color.text,
    // The one chip whose rim goes to full white — it sits on a white-topped ramp, so a 95%
    // rim would read as a grey line rather than as a lit edge.
    depth: lift("rgba(139,109,74,.18)", "rgba(168,140,100,.08)", { rim: "rgba(255,255,255,1)" }),
  },
} as const;

export function StatChip({
  icon,
  value,
  outOf,
  label,
  tint,
  trailing,
}: {
  icon: React.ReactNode;
  value: string;
  /** Renders as a smaller "/N" after the value — "2/4 done" says more than a bare "2". */
  outOf?: string;
  label: string;
  tint: "streak" | "done" | "goals";
  trailing?: React.ReactNode;
}) {
  const surface = CHIP_SURFACE[tint];

  return (
    <View style={[styles.statChipLift, { boxShadow: surface.depth.outer }]}>
      <View style={[styles.statChip, { borderColor: surface.border }]}>
        <GradientFill colors={surface.grad} />
        <InnerShading shadows={surface.depth.inner} radius={12} />
        {icon}
        <Text style={t(T.body, { fontSize: 15, fontWeight: "800", color: surface.fg })}>{value}</Text>
        {outOf ? (
          <Text
            style={t(T.badge, { fontSize: 10, fontWeight: "700", letterSpacing: 0, color: surface.fg, opacity: 0.6 })}
          >
            /{outOf}
          </Text>
        ) : null}
        {/* Kept to one line, and the labels are short enough to fit it whole — measured
            against the real font at the narrowest screen this app targets. Deliberately not
            flexShrink'd: if a longer label is ever passed it should visibly overflow here
            rather than quietly ellipsise and hide that it no longer fits. */}
        <Text numberOfLines={1} style={t(T.badge, { fontSize: 9, color: color.textFaint })}>
          {label}
        </Text>
        {trailing}
      </View>
    </View>
  );
}

/**
 * The halo behind Ferne on Home: a glow, two slowly counter-rotating arcs, a dashed orbit,
 * a breathing rim and three drifting specks — transcribed from the design's layered CSS.
 *
 * The arcs are decorative, not a gauge. The design draws them as fixed ~82% and ~79% arcs
 * that simply turn; binding one to real progress would empty the ring on a fresh day and
 * lose the look entirely.
 *
 * Every layer is pointerEvents none inside the caller's own Pressable, so the capture
 * button stays one tappable region and the walkthrough measures it as a single control.
 */
export function CaptureRing({ size: d = 176, animate = true, children }: { size?: number; animate?: boolean; children: React.ReactNode }) {
  const reduceMotion = useReduceMotion();
  const moving = animate && !reduceMotion;

  const spinA = useSpin(74000, moving);
  const spinB = useSpin(96000, moving, true);
  const spinDash = useSpin(26000, moving);
  const spinSpecks = useSpin(40000, moving);
  const pulse = useLoop(4600, moving);

  const c = d / 2;
  // The two arcs are drawn in the design's own 176 viewBox and scale with `size`.
  const orbit = d * 1.205; // the 212 dashed ring, drawn oversized around the box
  const rim = d * 1.227; // the 216 pulsing rim
  const speckField = d * 1.477; // the 260 speck orbit

  const layer = { position: "absolute" as const, width: d, height: d, left: 0, top: 0 };
  const centred = (box: number) => ({
    position: "absolute" as const,
    width: box,
    height: box,
    left: c - box / 2,
    top: c - box / 2,
  });

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.12] });

  return (
    <View style={{ width: d, height: d, alignItems: "center", justifyContent: "center" }}>
      {/* soft bloom Ferne sits inside */}
      <View style={centred(d * 1.182)} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="capGlow" cx="46%" cy="38%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.7} />
              <Stop offset="0.4" stopColor="#FFF0E5" stopOpacity={0.34} />
              <Stop offset="0.66" stopColor="#F0A382" stopOpacity={0.07} />
              <Stop offset="0.8" stopColor="#F0A382" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill="url(#capGlow)" />
        </Svg>
      </View>

      {/* breathing rim */}
      <Animated.View
        style={[centred(rim), { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]}
        pointerEvents="none"
      >
        <View style={styles.captureRim} />
      </Animated.View>

      {/* three specks on a slow carousel */}
      <Animated.View style={[centred(speckField), { transform: [{ rotate: spinSpecks }] }]} pointerEvents="none">
        <View style={[styles.speck, { width: 6, height: 6, backgroundColor: "rgba(240,180,41,.55)", top: 0, left: speckField / 2 - 3 }]} />
        <View style={[styles.speck, { width: 4, height: 4, backgroundColor: "rgba(164,191,67,.55)", bottom: 14, left: 22 }]} />
        <View style={[styles.speck, { width: 5, height: 5, backgroundColor: "rgba(223,109,65,.45)", top: 52, right: 6 }]} />
      </Animated.View>

      {/* outer arc */}
      <Animated.View style={[layer, { transform: [{ rotate: spinA }] }]} pointerEvents="none">
        <Svg width={d} height={d} viewBox="0 0 176 176">
          <Defs>
            <SvgLinearGradient id="ringA" x1="0.18" y1="0" x2="0.82" y2="1">
              <Stop offset="0" stopColor="#FDF2E9" />
              <Stop offset="0.45" stopColor="#F3D3BC" />
              <Stop offset="1" stopColor="#E1A582" />
            </SvgLinearGradient>
          </Defs>
          <Circle
            cx={88}
            cy={88}
            r={76}
            fill="none"
            stroke="url(#ringA)"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray="390 87.6"
            rotation={78}
            originX={88}
            originY={88}
          />
        </Svg>
      </Animated.View>

      {/* inner arc, turning the other way */}
      <Animated.View style={[layer, { transform: [{ rotate: spinB }] }]} pointerEvents="none">
        <Svg width={d} height={d} viewBox="0 0 176 176">
          <Defs>
            <SvgLinearGradient id="ringB" x1="0.8" y1="0.05" x2="0.2" y2="0.95">
              <Stop offset="0" stopColor="#FFFAF4" />
              <Stop offset="0.5" stopColor="#F8E4D5" />
              <Stop offset="1" stopColor="#EDC3A6" />
            </SvgLinearGradient>
          </Defs>
          <Circle
            cx={88}
            cy={88}
            r={62}
            fill="none"
            stroke="url(#ringB)"
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeDasharray="309 80.6"
            rotation={82.5}
            originX={88}
            originY={88}
          />
        </Svg>
      </Animated.View>

      {/* dashed orbit */}
      <Animated.View style={[centred(orbit), { transform: [{ rotate: spinDash }] }]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 212 212">
          <Circle
            cx={106}
            cy={106}
            r={100}
            fill="none"
            stroke="rgba(240,180,41,.55)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="3 13"
          />
        </Svg>
      </Animated.View>

      {children}
    </View>
  );
}

/** Pending task row — type tile, title + type label, and a trailing action button. */
export function TaskRow({
  title,
  taskType,
  goalName,
  goalColor,
  subtitle,
  xp,
  actionLabel,
  onPress,
  onAction,
}: {
  title: string;
  taskType: TaskType;
  goalName?: string;
  goalColor?: string;
  subtitle?: string | null;
  /** Points this task is worth if focused for its planned length. Omitted when unknown. */
  xp?: number;
  actionLabel: string;
  onPress: () => void;
  onAction: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.taskRow}>
      <TaskTypeTile taskType={taskType} />
      <View style={styles.taskRowText}>
        <Text style={t(T.bodyLg, { color: color.text })}>{title}</Text>
        {/* Type, goal, time and points share one wrapping line — as separate rows they
            pushed the row tall enough that only two fit on screen at a time. */}
        <View style={styles.taskRowMeta}>
          <TaskTypeLabel taskType={taskType} goalName={goalName} goalColor={goalColor} detail={subtitle} />
          {xp != null ? <XpTag points={xp} /> : null}
        </View>
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
  xp,
  onPress,
}: {
  title: string;
  taskType: TaskType;
  /** Points actually earned. Omitted when unknown — never guessed. */
  xp?: number;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={styles.completedRow}
    >
      <GradientFill
        colors={[
          { offset: 0, color: "#F8FBEF" },
          { offset: 1, color: "#EEF3E1" },
        ]}
      />
      <TaskTypeTile taskType={taskType} completed size={32} />
      <View style={styles.taskRowText}>
        <Text
          style={t(T.bodyLg, {
            color: "#5F7226",
            textDecorationLine: "line-through",
            textDecorationColor: "rgba(95,114,38,.45)",
          })}
        >
          {title}
        </Text>
        {xp != null ? <XpTag points={xp} suffix="earned" tone="earned" /> : null}
      </View>
      {/* Filled disc rather than a bare glyph: at the end of a row of tinted tiles a loose
          ✓ read as leftover text rather than as the row's completed state. */}
      <View style={styles.completedBadge}>
        <Svg width={15} height={15} viewBox="0 0 24 24">
          <Path
            d="M5 12.5l4.5 4.5L19 7"
            stroke={color.screen}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
    </Pressable>
  );
}

/** Line box for a goal name, doubled to reserve the two lines every tile is sized for. */
const GOAL_NAME_LINE_HEIGHT = 15;

/** Height of the progress groove. The design's 7 — it costs nothing next to taller text. */
const GOAL_TRACK_H = 7;

/** Constant across goals — only the accent ramp below varies, so this is built once. */
const GOAL_DEPTH = lift("rgba(139,109,74,.22)", "rgba(168,140,100,.07)", {
  variant: "card",
  rim: "rgba(255,255,255,1)",
});

/** The channel the progress bar sits in, pressed into the card rather than laid on it. */
const TRACK_GROOVE: BoxShadowValue[] = [
  { offsetX: 0, offsetY: 1, blurRadius: 2, color: "rgba(139,109,74,.28)", inset: true },
];

/** A lit top edge on the fill, so it reads as a rounded bead in the groove. */
const TRACK_FILL_RIM: BoxShadowValue[] = [
  { offsetX: 0, offsetY: 1, blurRadius: 0, color: "rgba(255,255,255,.5)", inset: true },
];

/** Goal tile — name, progress bar tinted with the goal's own colour, day count. */
export function GoalCard({ goal, onPress, width }: { goal: GoalDto; onPress?: () => void; width?: number }) {
  const accent = goal.color ?? color.goal;
  const pct = goal.targetDays ? Math.min(100, (goal.totalDaysActive / goal.targetDays) * 100) : 0;
  // Lit top, shaded bottom — the design never paints a goal accent flat. The same pair
  // does the swatch and the bar fill, which is what ties them together as one colour.
  const [accentLit, accentShade] = accentRamp(accent);
  // The design casts the swatch's shadow in its own hue rather than in grey — a deeper cut
  // of the accent at half alpha ("80" is the hex byte for it).
  const swatchShadow: BoxShadowValue[] = [
    { offsetX: 0, offsetY: 1, blurRadius: 2, color: `${shade(accent, -20)}80` },
  ];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${goal.name}, ${goal.totalDaysActive} of ${goal.targetDays} days`}
      style={width ? { width } : { flex: 1 }}
    >
      {/* Two layers, not one: the clip that keeps the gradient inside the rounded corners
          would also clip the drop shadow off the same View, so the drop rides out here and
          the rim/floor insets stay on the clipped box below. */}
      <View style={[styles.goalCardShadowWrap, { boxShadow: GOAL_DEPTH.outer }]}>
        <View style={styles.goalCard}>
          <GradientFill
            colors={[
              { offset: 0, color: "#FFFFFF" },
              { offset: 0.56, color: "#FFFDF8" },
              { offset: 1, color: "#F9F2E6" },
            ]}
          />
          <InnerShading shadows={GOAL_DEPTH.inner} radius={13} />
          <View style={styles.goalHeader}>
            {/* Self-clipping rather than parent-clipped: the swatch carries its own drop
                shadow, and an overflow:hidden here would trim that off. */}
            <View style={[styles.goalSwatch, { boxShadow: swatchShadow }]}>
              <GradientFill
                angle={150}
                radius={3}
                colors={[
                  { offset: 0, color: accentLit },
                  { offset: 1, color: accentShade },
                ]}
              />
            </View>
            <Text
              style={[t(T.label, { fontSize: 13, fontWeight: "800", color: color.text, flex: 1 }), styles.goalName]}
              numberOfLines={2}
            >
              {goal.name}
            </Text>
          </View>
          {/* Track and count share a row. As stacked lines they cost a third of the tile's
              height to say one thing, which is what made the goals strip the most
              space-hungry block on Home for the least information. */}
          <View style={styles.goalFooter}>
            <View style={styles.goalTrack}>
              {/* Groove, not a flat channel: a pale-to-paler ramp plus an inset top shadow,
                  so the bar reads as sitting in the card rather than painted on it. */}
              <GradientFill
                angle={180}
                radius={GOAL_TRACK_H / 2}
                colors={[
                  { offset: 0, color: "#EADFCB" },
                  { offset: 1, color: "#F6EEDF" },
                ]}
              />
              <InnerShading shadows={TRACK_GROOVE} radius={GOAL_TRACK_H / 2} />
              <View style={[styles.goalTrackFill, { width: `${pct}%` }]}>
                <GradientFill
                  angle={180}
                  radius={GOAL_TRACK_H / 2}
                  colors={[
                    { offset: 0, color: accentLit },
                    { offset: 1, color: accentShade },
                  ]}
                />
                <InnerShading shadows={TRACK_FILL_RIM} radius={GOAL_TRACK_H / 2} />
              </View>
            </View>
            <Text style={t(T.badge, { fontSize: 10, letterSpacing: 0, color: color.textFaint })} numberOfLines={1}>
              {goal.totalDaysActive}/{goal.targetDays}
              {goal.status === "completed" ? " ✓" : ""}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Dashed "+ Goal" tile that sits at the end of the goal strip. */
export function AddGoalCard({ onPress, width = 78 }: { onPress: () => void; width?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="New goal" style={[styles.addGoal, { width }]}>
      {/* Inset by the border width and clipped on its own radius rather than by the parent:
          an absoluteFill child would paint straight over the dashed edge, and putting
          overflow:hidden on the bordered View itself is what would clip that edge instead. */}
      <View style={styles.addGoalSheen}>
        <GradientFill
          radius={13}
          colors={[
            { offset: 0, color: "rgba(255,255,255,.7)" },
            { offset: 1, color: "rgba(255,255,255,0)" },
          ]}
        />
      </View>
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
      <Text style={t(T.meta, { color: color.textMuted, marginTop: 2 })}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 28,
    marginTop: 14,
    marginBottom: 8,
  },
  sectionLabel: {
    // RN defaults flexShrink to 0, so this has to be said explicitly for the label to give
    // ground to the toggle pill rather than wrapping.
    flexShrink: 1,
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
    // The label is two words at its longest, and the rule to its left is flex:1 — without
    // this the rule would win the contest for space and squeeze "Collapse all" onto two
    // lines on a narrow screen.
    flexShrink: 0,
  },
  typeTile: {
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 0,
    flexShrink: 0,
  },
  /** Drop-shadow-only outer layer — see `lift()` for why it can't share the clipped box. */
  statChipLift: {
    flex: 1,
    borderRadius: 13,
  },
  statChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 13,
    paddingVertical: 7,
    paddingHorizontal: 7,
    // Required: GradientFill paints the full box and relies on the parent to clip it.
    overflow: "hidden",
  },
  captureRim: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(223,109,65,.30)",
  },
  speck: {
    position: "absolute",
    borderRadius: 999,
  },
  taskRow: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    paddingVertical: 9,
    paddingLeft: 10,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  taskRowText: {
    flex: 1,
    gap: 4,
  },
  taskRowMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  xpTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  taskRowAction: {
    backgroundColor: "#EBC294",
    borderRadius: radius.control,
    paddingVertical: 9,
    paddingHorizontal: 15,
  },
  completedRow: {
    borderWidth: 1,
    borderColor: "#DEE8C7",
    overflow: "hidden",
    opacity: 0.82,
    borderRadius: radius.card,
    // Left padding matches TaskRow's 11 so the tile columns of the two sections line up;
    // the right side keeps the wider gutter the badge needs.
    paddingVertical: 9,
    paddingLeft: 10,
    paddingRight: space.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  completedBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.doneCheck,
    alignItems: "center",
    justifyContent: "center",
  },
  // Matches goalCard's radius so the shadow follows the card's real silhouette.
  goalCardShadowWrap: {
    borderRadius: 14,
  },
  goalCard: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: "rgba(237,224,198,.9)",
    borderRadius: 14,
    overflow: "hidden",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  goalHeader: {
    flexDirection: "row",
    // Top-aligned rather than centred: the name below occupies two lines whether or not it
    // needs them, and centring against that block would float the swatch into the gap
    // beside a one-line name.
    alignItems: "flex-start",
    gap: space.sm,
  },
  goalSwatch: {
    width: 9,
    height: 9,
    borderRadius: 3,
    // Optically centres the swatch on the name's first line ((lineHeight - size) / 2).
    marginTop: (GOAL_NAME_LINE_HEIGHT - 9) / 2,
  },
  /**
   * Always two lines tall, even for a name that fits on one. Goal tiles sit side by side in
   * a horizontal strip, and letting each size itself to its own name gave the row cards of
   * two different heights. lineHeight is set explicitly because RN's default varies by
   * platform and font, which is exactly the kind of thing that makes a reserved height
   * drift out of sync with the text it's reserving space for.
   */
  goalName: {
    lineHeight: GOAL_NAME_LINE_HEIGHT,
    height: GOAL_NAME_LINE_HEIGHT * 2,
  },
  goalFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  goalTrack: {
    flex: 1,
    height: GOAL_TRACK_H,
    borderRadius: GOAL_TRACK_H / 2,
    justifyContent: "center",
  },
  goalTrackFill: {
    height: GOAL_TRACK_H,
    borderRadius: GOAL_TRACK_H / 2,
  },
  addGoal: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#C8D2CE",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  addGoalSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 13,
  },
  statCard: {
    flex: 1,
    // Deliberately tighter than Card's own default (space.card=13), rather than that
    // literal 14 it used to override to — this sits in a dense 2×2 grid of its own, unlike
    // Card's general-purpose use elsewhere.
    padding: 11,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
