import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { color, radius, size, space, text as t, type as T } from "../theme";

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
export function Badge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={t(T.badge, { color: color.amberText })}>{label}</Text>
    </View>
  );
}

/** Green-tinted informational block. Non-interactive by design — never render one as a switch. */
export function InfoCard({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View accessibilityRole="text" style={styles.infoCard}>
      {icon ? <IconRow icon={icon}>{children}</IconRow> : children}
    </View>
  );
}

/**
 * Ferne, the companion. The circle is pinned with flexGrow/flexShrink/flexBasis so a flex
 * row can never stretch it into an oval — the handoff calls this out as a real bug from
 * the web build.
 */
export function Ferne({
  size: diameter = size.ferne,
  message,
  /** Closed eyes — used while a focus session runs. */
  asleep = false,
}: {
  size?: number;
  message?: string;
  asleep?: boolean;
}) {
  const eye = asleep
    ? { width: diameter * 0.17, height: 2, backgroundColor: "#fff" }
    : { width: diameter * 0.17, height: diameter * 0.17, borderRadius: diameter, backgroundColor: "#fff" };

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}>
      <View
        style={{
          width: diameter,
          height: diameter,
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: diameter,
          borderRadius: diameter / 2,
          backgroundColor: color.ferne,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: diameter * 0.26,
        }}
      >
        <View style={eye} />
        <View style={eye} />
      </View>
      {message ? (
        <View style={styles.bubble}>
          <Text style={t(T.meta, { color: color.textBody, lineHeight: 19 })}>{message}</Text>
        </View>
      ) : null}
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
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={[styles.settingsRow, !last && styles.settingsRowDivider]}
    >
      <Text style={t(T.body, { color: color.textBody, flexShrink: 1 })}>{label}</Text>
      {right}
    </Pressable>
  );
}

/** −/+ stepper, used for the weekly goal and Pomodoro cycle count. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  suffix,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  label: string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        hitSlop={12}
        onPress={() => onChange(Math.max(min, value - 1))}
      >
        <Text style={t(T.bodyLg, { color: color.textMuted })}>−</Text>
      </Pressable>
      <Text style={t(T.body, { fontWeight: "800", color: color.text })}>
        {value}
        {suffix ? ` ${suffix}` : ""}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        hitSlop={12}
        onPress={() => onChange(Math.min(max, value + 1))}
      >
        <Text style={t(T.bodyLg, { color: color.textMuted })}>+</Text>
      </Pressable>
    </View>
  );
}

/** Screen root — the design's warm background, edge to edge. */
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flex: 1, backgroundColor: color.screen }, style]}>{children}</View>;
}

/** "← Back" affordance with a full-height touch target. */
export function BackLink({ onPress, label = "← Back" }: { onPress: () => void; label?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} style={styles.backLink}>
      <Text style={t(T.body, { fontWeight: "800", color: color.selectedText })}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: color.amberFill,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  infoCard: {
    backgroundColor: color.successFill,
    borderWidth: 1,
    borderColor: color.successBorder,
    borderRadius: radius.control,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  bubble: {
    flex: 1,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    paddingVertical: 11,
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
    borderBottomColor: color.divider,
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
