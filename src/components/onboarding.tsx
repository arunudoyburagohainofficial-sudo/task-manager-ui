import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Ferne, Meta } from "./index";
import { px, space } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";

/** Back chip and the progress bar that sit at the top of every step after Welcome. */
export function OnboardingHeader({
  onBack,
  progress,
  segments,
  current,
}: {
  onBack?: () => void;
  /** 0–1 for the single continuous bar used on the hook steps. */
  progress?: number;
  /**
   * One entry per permission, true where it is already granted. Taken per step rather than as a
   * count: these can be granted out of order, and a count would both fill the wrong segments and
   * put the wrong number in the counter.
   */
  segments?: boolean[];
  /** Index of the step being asked for now, which is what the "n of N" counter reports. */
  current?: number;
}) {
  const s = useThemedStyles(makeStyles);
  const theme = useTheme();

  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={s.backChip} hitSlop={8}>
          <Text style={s.backGlyph}>←</Text>
        </Pressable>
      ) : null}

      {segments ? (
        <>
          <View style={s.segmentRow}>
            {segments.map((done, i) => (
              <View
                key={i}
                style={[s.segment, { backgroundColor: done ? theme.surface.primary : theme.surface.segTrack }]}
              />
            ))}
          </View>
          <Meta style={s.counter}>
            {(current ?? 0) + 1} of {segments.length}
          </Meta>
        </>
      ) : null}

      {progress != null ? (
        <View style={s.track}>
          <View style={[s.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

/** Fern saying something, in the same bubble the rest of the app uses. */
export function FerneSays({
  children,
  size = 64,
  align = "flex-end",
  style,
}: {
  children: React.ReactNode;
  size?: number;
  align?: ViewStyle["alignItems"];
  style?: ViewStyle;
}) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={[s.saysRow, { alignItems: align }, style]}>
      <View style={{ width: px(size), height: px(size) }}>
        <Ferne size={px(size)} />
      </View>
      <View style={s.bubble}>{children}</View>
    </View>
  );
}

/** The one pinned action per screen. */
export function OnboardingAction({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const s = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.action, disabled && s.actionOff, pressed && !disabled && s.actionPressed]}
    >
      <Text style={[s.actionInk, disabled && s.actionOffInk]}>{label}</Text>
    </Pressable>
  );
}

/** A quieter text button under the primary one. */
export function OnboardingTextLink({ label, onPress, tone = "muted" }: { label: string; onPress: () => void; tone?: "muted" | "danger" }) {
  const s = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}>
      <Text style={[s.link, tone === "danger" && { color: theme.color.danger }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Tokens) =>
  StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", gap: px(14), paddingHorizontal: space.lg, paddingTop: px(10) },
    backChip: {
      width: px(38),
      height: px(38),
      borderRadius: px(12),
      backgroundColor: theme.surface.chipBg,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    backGlyph: { fontSize: px(17), fontWeight: "600", color: theme.color.textBody, lineHeight: px(20) },

    track: { flex: 1, height: px(6), borderRadius: 99, backgroundColor: theme.surface.segTrack, overflow: "hidden" },
    fill: { height: "100%", borderRadius: 99, backgroundColor: theme.surface.primary },

    segmentRow: { flex: 1, flexDirection: "row", gap: px(6) },
    segment: { flex: 1, height: px(6), borderRadius: 99 },
    counter: { fontSize: px(12), fontWeight: "800", color: theme.color.textMuted },

    saysRow: { flexDirection: "row", gap: px(12) },
    bubble: {
      flex: 1,
      minWidth: 0,
      backgroundColor: theme.surface.bubble,
      borderRadius: px(18),
      borderBottomLeftRadius: px(4),
      paddingHorizontal: px(18),
      paddingVertical: px(16),
    },

    action: {
      backgroundColor: theme.surface.primary,
      borderRadius: px(14),
      paddingVertical: px(17),
      alignItems: "center",
      shadowColor: theme.surface.primaryShadow,
      shadowOpacity: 1,
      shadowRadius: px(22),
      shadowOffset: { width: 0, height: px(10) },
      elevation: 4,
    },
    actionPressed: { opacity: 0.9 },
    actionOff: { backgroundColor: theme.surface.primaryOff, shadowOpacity: 0, elevation: 0 },
    actionInk: { fontSize: px(15), fontWeight: "800", letterSpacing: 0.075, color: theme.surface.primaryInk },
    actionOffInk: { color: theme.surface.primaryOffInk },

    link: { textAlign: "center", fontSize: px(14), fontWeight: "700", color: theme.color.textBody },
  });
