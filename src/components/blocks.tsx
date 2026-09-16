import React from "react";
import { Pressable, StyleSheet, Text, View, type BoxShadowValue } from "react-native";
import type { GoalDto } from "../api/types";
import { accentRamp, color, lift, shade, space, text as t, type as T } from "../theme";
import { Card } from "./Card";
import { GradientFill, InnerShading } from "./ScreenWash";

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
  /** Drop-shadow-only outer layer — see `lift()` for why it can't share the clipped box. */
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
