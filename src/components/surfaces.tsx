import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { radius, size, space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";

/**
 * The vocabulary the final screens are built from — Capture, Organize, Progress, Settings, Task
 * Detail and the schedule sheet all draw from these five pieces.
 *
 * Four rules, from the handoff's own legend, and every piece here exists to keep one of them:
 *
 *  - **One loud thing per screen.** `PrimaryAction` is the only terracotta fill; a row's own
 *    action is the softer `ActionPill`.
 *  - **One action pinned to the bottom.** `PinnedBar` sits outside the scroll view, so the
 *    primary can never be scrolled past.
 *  - **Related rows are one card with hairlines**, not a stack of bordered boxes — `PanelCard`
 *    plus `PanelRow`, which draws its own divider unless it's the last.
 *  - **Home's section-label rhythm everywhere** — `SectionLabel`: an 11/800 eyebrow, an optional
 *    count, then a hairline running to the right edge.
 */

/* --------------------------------------------------------------- section label */

export function SectionLabel({
  children,
  /** A count pill after the label — the captured count, a goal count, "1 UNSAVED". */
  badge,
  /** The small info circle the design puts beside a few labels. */
  info,
  style,
}: {
  children: string;
  badge?: React.ReactNode;
  info?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.sectionLabel, style]}>
      <Text style={t(T.eyebrow, { color: theme.color.textLabel })}>{children}</Text>
      {info}
      {badge}
      {/* Runs to the right edge, which is what makes a label read as a section rather than as
          a heading sitting on its own. */}
      <View style={styles.sectionRule} />
    </View>
  );
}

/** A count pill: amber by default, olive for goals, terracotta for an unsaved change. */
export function CountPill({ label, tone = "amber" }: { label: string; tone?: "amber" | "done" | "unsaved" }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const s = theme.surface;
  const paint =
    tone === "done"
      ? { bg: s.badgeDoneBg, ink: s.badgeDoneInk }
      : tone === "unsaved"
        ? { bg: s.badgeUnsavedBg, ink: s.badgeUnsavedInk }
        : { bg: s.badgeAmberBg, ink: s.badgeAmberInk };
  return (
    <View style={[styles.countPill, { backgroundColor: paint.bg }]}>
      <Text style={t(T.badge, { color: paint.ink })}>{label}</Text>
    </View>
  );
}

/* ----------------------------------------------------------------- panel card */

/**
 * One card, hairline-ruled inside. `overflow: hidden` so a row's own tint (an unsaved row) stops
 * at the rounded corner instead of squaring it off.
 */
export function PanelCard({
  children,
  /** The design lifts the card that carries the screen's main figure. */
  lifted = false,
  style,
}: {
  children: React.ReactNode;
  lifted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.panel, lifted && styles.panelLifted, style]}>{children}</View>;
}

/** The 1px rule between two rows of a card. */
export function Hairline() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.hairline} />;
}

/**
 * A row inside a `PanelCard`: a fixed label on the left, whatever the row is worth on the right.
 *
 * A plain View when there's nothing to press — never a disabled Pressable, which would hand its
 * `aria-disabled` to the switch or stepper sitting inside it (see SettingsRow for the same note).
 */
export function PanelRow({
  label,
  /** Drawn instead of `label` when a row needs more than one line of text. */
  children,
  right,
  onPress,
  last = false,
  /** A leading icon, as the timing rows on Task Detail have. */
  icon,
  /** The eyebrow above the label, for rows that carry a value under a caption. */
  eyebrow,
  /** Marks the row as carrying an unsaved change: a tint and a dot. */
  pending = false,
  accessibilityLabel,
  style,
}: {
  label?: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
  icon?: React.ReactNode;
  eyebrow?: string;
  pending?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const Row = onPress ? Pressable : View;
  return (
    <>
      <Row
        {...(onPress ? { onPress, accessibilityRole: "button" as const, accessibilityLabel } : {})}
        style={[styles.row, pending && styles.rowPending, style]}
      >
        {pending ? <View style={styles.pendingDot} /> : null}
        {icon}
        <View style={styles.rowMain}>
          {eyebrow ? <Text style={t(T.eyebrow, { color: theme.color.textLabel })}>{eyebrow}</Text> : null}
          {label ? (
            <Text style={t(T.body, { fontWeight: "700", color: theme.color.text })} numberOfLines={2}>
              {label}
            </Text>
          ) : null}
          {children}
        </View>
        {right ? <View style={styles.rowRight}>{right}</View> : null}
      </Row>
      {last ? null : <Hairline />}
    </>
  );
}

/** A paragraph that belongs to the card above it, drawn inside it under a hairline. */
export function PanelNote({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={[t(T.meta, { color: theme.color.textFaint, lineHeight: 19 }), styles.note]}>{children}</Text>
  );
}

/* --------------------------------------------------------------------- actions */

/**
 * A row's own action — "Add", "Pick", "Attach", "Start". Home's soft amber, deliberately not the
 * screen's terracotta: a row can offer something without competing with the one pinned action.
 */
export function ActionPill({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.actionPill, pressed && { opacity: 0.85 }]}
    >
      <Text style={t(T.meta, { fontWeight: "800", color: theme.surface.actionInk })}>{label}</Text>
    </Pressable>
  );
}

/** The one filled action per screen. Disabled reads as disabled, rather than as dimmed terracotta. */
export function PrimaryAction({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const inert = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        inert ? styles.primaryOff : null,
        !inert && pressed ? { opacity: 0.9 } : null,
        style,
      ]}
    >
      <Text
        style={t(T.button, {
          fontSize: 15,
          color: inert ? theme.surface.primaryOffInk : theme.surface.primaryInk,
        })}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The outlined companion to a PrimaryAction. */
export function SecondaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]}
    >
      <Text style={t(T.button, { fontSize: 15, fontWeight: "700", color: theme.surface.cancelInk })}>{label}</Text>
    </Pressable>
  );
}

/**
 * The bar the primary action is pinned to — outside the scroll view, so it can't be scrolled
 * past. That's the whole point of it: the design moved these off the page for exactly that
 * reason.
 */
export function PinnedBar({
  children,
  /**
   * Set on a screen inside the tab navigator. The docked capture disc rises above the bar and
   * would otherwise sit on top of whatever is pinned here — see `size.dockRise`.
   */
  clearsDock = false,
  style,
}: {
  children: React.ReactNode;
  clearsDock?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.pinned, clearsDock && { paddingBottom: size.dockRise }, style]}>{children}</View>;
}

/* ---------------------------------------------------------------------- ghosts */

/** A dashed placeholder row — "+ Add another", the empty goals slot. */
export function GhostRow({
  label,
  onPress,
  icon,
  quiet = false,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  /** The emptier state of the two the design draws. */
  quiet?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const Row = onPress ? Pressable : View;
  return (
    <Row
      {...(onPress ? { onPress, accessibilityRole: "button" as const, accessibilityLabel: accessibilityLabel ?? label } : {})}
      style={styles.ghost}
    >
      {icon}
      <Text
        style={t(T.label, {
          fontSize: 14,
          fontWeight: icon ? "600" : "700",
          color: quiet ? theme.surface.dashInkQuiet : theme.surface.dashInk,
          textAlign: icon ? "left" : "center",
          flex: icon ? 1 : undefined,
        })}
      >
        {label}
      </Text>
    </Row>
  );
}

/** The dashed circle that stands in for a goal ring when nothing is attached. */
export function GhostRing({ diameter = 34, children }: { diameter?: number; children?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: theme.surface.ghostRing,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    sectionLabel: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
    },
    sectionRule: {
      flex: 1,
      height: 1,
      backgroundColor: t.surface.rule,
    },
    countPill: {
      borderRadius: 7,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    panel: {
      backgroundColor: t.surface.card,
      borderWidth: 1,
      borderColor: t.surface.cardBorder,
      borderRadius: radius.panel,
      overflow: "hidden",
    },
    panelLifted: {
      boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 14, color: t.surface.cardShadow }],
    },
    hairline: {
      height: 1,
      backgroundColor: t.surface.hairline,
    },
    row: {
      minHeight: size.minTouch,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    rowPending: {
      backgroundColor: t.surface.unsavedRowBg,
    },
    pendingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: t.surface.unsavedDot,
    },
    rowMain: {
      flex: 1,
      gap: 3,
    },
    rowRight: {
      flexShrink: 1,
      alignItems: "flex-end",
    },
    note: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 14,
    },
    actionPill: {
      backgroundColor: t.surface.action,
      borderRadius: 12,
      paddingHorizontal: 18,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    primary: {
      backgroundColor: t.surface.primary,
      borderRadius: radius.chip,
      paddingVertical: 17,
      paddingHorizontal: space.gutter,
      alignItems: "center",
      justifyContent: "center",
      boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 22, spreadDistance: -11, color: t.surface.primaryShadow }],
    },
    primaryOff: {
      backgroundColor: t.surface.primaryOff,
      boxShadow: [],
    },
    secondary: {
      borderWidth: 1,
      borderColor: t.surface.cancelBorder,
      borderRadius: radius.chip,
      paddingVertical: 17,
      paddingHorizontal: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    pinned: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: space.gutter,
      paddingTop: 12,
      paddingBottom: 12,
    },
    ghost: {
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: t.surface.dashBorder,
      borderRadius: radius.chip,
      paddingVertical: 13,
      paddingHorizontal: 14,
      minHeight: size.minTouch,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      justifyContent: "center",
    },
  });
