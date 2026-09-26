import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { radius, size, space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";

/**
 * The canonical icon + label pairing (design §5, non-negotiable): centred row, gap 8.
 * Never align an icon to a text baseline, never give it a trailing margin.
 */
export function IconRow({
  icon,
  children,
  gap = space.sm,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  gap?: number;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap }}>
      {icon}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** Small amber chip — "SOON" and similar status markers. */
/**
 * `tone` keeps the schedule tags on Task Detail from having to be a near-copy of this.
 * Amber is right for "SOON" and for a task waiting on a future day, but a missed one has
 * to read as a problem rather than as a neutral status.
 */
export function Badge({ label, tone = "amber" }: { label: string; tone?: "amber" | "danger" }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const palette =
    tone === "danger"
      ? { backgroundColor: theme.color.dangerFill, color: theme.color.danger }
      : { backgroundColor: theme.color.amberFill, color: theme.color.amberText };
  return (
    <View style={[styles.badge, { backgroundColor: palette.backgroundColor }]}>
      <Text style={t(T.badge, { color: palette.color })}>{label}</Text>
    </View>
  );
}

/** Green-tinted informational block. Non-interactive by design — never render one as a switch. */
export function InfoCard({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View accessibilityRole="text" style={styles.infoCard}>
      {icon ? <IconRow icon={icon}>{children}</IconRow> : children}
    </View>
  );
}

/** One row inside a settings card. Non-pressable when no handler is given. */
export function SettingsRow({
  label,
  right,
  onPress,
  last = false,
}: {
  label: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  /*
   * A plain View when there's nothing to press — not a disabled Pressable. A disabled Pressable
   * renders aria-disabled, which ARIA applies to everything inside it: the weekly-goal stepper and
   * the Reminder notifications switch sit inside these rows, so a screen reader announced them as
   * disabled (and automation refused to press them) although they worked perfectly.
   */
  const Row = onPress ? Pressable : View;
  return (
    <Row
      {...(onPress ? { onPress, accessibilityRole: "button" as const } : {})}
      style={[styles.settingsRow, !last && styles.settingsRowDivider]}
    >
      {/* label is the short, fixed caption ("Email", "Name"...) — it must never be the
          side that shrinks. Long values (a full email address) belong to `right`, wrapped
          here so it's the one that shrinks/wraps within whatever space is left, instead
          of overflowing at its natural width and squeezing label down to nothing (RN's
          default flexShrink is 0, unlike web, so an unconstrained long value doesn't wrap
          politely on its own — it just claims however much room it wants). */}
      <Text style={t(T.body, { color: theme.color.textBody, flexShrink: 0 })}>{label}</Text>
      <View style={styles.settingsRowValue}>{right}</View>
    </Row>
  );
}

/** −/+ stepper, used for the weekly goal and Pomodoro cycle count. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  step = 1,
  suffix,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  label: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        hitSlop={12}
        onPress={() => onChange(Math.max(min, value - step))}
      >
        <Text style={t(T.bodyLg, { color: theme.color.textMuted })}>−</Text>
      </Pressable>
      <Text style={t(T.body, { fontWeight: "800", color: theme.color.text })}>
        {value}
        {suffix ? ` ${suffix}` : ""}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        hitSlop={12}
        onPress={() => onChange(Math.min(max, value + step))}
      >
        <Text style={t(T.bodyLg, { color: theme.color.textMuted })}>+</Text>
      </Pressable>
    </View>
  );
}

/** Screen root — the design's warm background, edge to edge. */
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return <View style={[{ flex: 1, backgroundColor: theme.color.screen }, style]}>{children}</View>;
}

/** "← Back" affordance with a full-height touch target. */
export function BackLink({ onPress, label = "← Back" }: { onPress: () => void; label?: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} style={styles.backLink}>
      <Text style={t(T.body, { fontWeight: "800", color: theme.color.selectedText })}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    badge: {
      backgroundColor: t.color.amberFill,
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 6,
    },
    infoCard: {
      backgroundColor: t.color.successFill,
      borderWidth: 1,
      borderColor: t.color.successBorder,
      borderRadius: radius.control,
      paddingVertical: 12,
      paddingHorizontal: 13,
    },
    settingsRow: {
      minHeight: size.minTouch,
      paddingHorizontal: space.card,
      paddingVertical: space.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.base,
    },
    settingsRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: t.color.divider,
    },
    settingsRowValue: {
      flexShrink: 1,
      alignItems: "flex-end",
    },
    stepper: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    backLink: {
      minHeight: size.minTouch,
      justifyContent: "center",
    },
  });
