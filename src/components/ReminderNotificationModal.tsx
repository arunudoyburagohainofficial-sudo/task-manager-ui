import React from "react";
import { Modal, StyleSheet, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii, spacing } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { Body, Text } from "./Text";
import { Button } from "./Button";

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,26,26,.45)",
    justifyContent: "center",
  },
  card: {
    marginHorizontal: 16,
    borderRadius: radii.modal,
    padding: spacing.md,
    gap: 14,
    alignItems: "center",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    fontVariant: ["tabular-nums"],
  },
  tagRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  intervalPill: {
    borderRadius: radii.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  actions: {
    width: "100%",
    gap: 10,
    marginTop: 6,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionFlex: {
    flex: 1,
  },
});

interface ReminderNotificationModalProps {
  visible: boolean;
  taskName: string;
  time: string; // already formatted, e.g. "6:15 PM"
  /** Present only for an interval reminder's nudge — e.g. "Interval · 6-8 PM". */
  intervalLabel?: string;
  /** True for a focus-task pre-start nudge — shows "Start now" instead of "Done". */
  isFocusPreStart?: boolean;
  onPrimaryAction: () => void;
  onSnooze: () => void;
  /** "Stop reminders" for an interval reminder, "Dismiss" otherwise. */
  onSecondaryAction: () => void;
  secondaryLabel: string;
}

/**
 * In-app equivalent of the mockup's push-notification action screen (11). Not yet wired
 * to real notifications — remote FCM push needs an Expo dev client (see
 * memory/project_design_handoff.md) which this build pass deliberately defers. Kept as a
 * standalone component so it's ready to invoke from a notification-tap handler later.
 */
export function ReminderNotificationModal({
  visible,
  taskName,
  time,
  intervalLabel,
  isFocusPreStart = false,
  onPrimaryAction,
  onSnooze,
  onSecondaryAction,
  secondaryLabel,
}: ReminderNotificationModalProps) {
  const { colors } = useAppearance();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryTintBg }]}>
            <Text size={24}>🔔</Text>
          </View>
          <Text size={fontSize.xl} weight="bold">
            {isFocusPreStart ? "Time to start" : "Time to work on"}
          </Text>
          <Text size={fontSize.bodyLg} weight="bold">
            {taskName}
          </Text>
          <Text size={26} weight="extraBold" color={colors.textMuted} style={styles.timeText}>
            {time}
          </Text>
          {intervalLabel ? (
            <View style={styles.tagRow}>
              <View style={[styles.intervalPill, { backgroundColor: colors.primaryTintBg }]}>
                <Text size={fontSize.tiny} weight="bold" color={colors.primaryTintText}>
                  {intervalLabel}
                </Text>
              </View>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button label={isFocusPreStart ? "Start now" : "Done ✓"} onPress={onPrimaryAction} />
            <View style={styles.actionRow}>
              <Button label="Snooze 15 min" variant="secondary" onPress={onSnooze} style={styles.actionFlex} />
              <Button label={secondaryLabel} variant="secondary" onPress={onSecondaryAction} style={styles.actionFlex} />
            </View>
          </View>
          <Body size={fontSize.micro} color={colors.textFaint}>
            {isFocusPreStart
              ? "This is just a nudge — starting the session is still up to you"
              : "Done stops all nudges · Stop keeps the task open"}
          </Body>
        </View>
      </View>
    </Modal>
  );
}
