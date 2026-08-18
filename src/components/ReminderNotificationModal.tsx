import React from "react";
import { Modal, View } from "react-native";
import { useAppearance } from "../state/AppearanceContext";
import { radii, spacing } from "../theme/spacing";
import { fontSize } from "../theme/typography";
import { Body, Text } from "./Text";
import { Button } from "./Button";
import { CategoryTag } from "./CategoryTag";
import type { CategoryDto } from "../api/types";

interface ReminderNotificationModalProps {
  visible: boolean;
  taskName: string;
  category: CategoryDto | null;
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
  category,
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
      <View style={{ flex: 1, backgroundColor: "rgba(26,26,26,.45)", justifyContent: "center" }}>
        <View
          style={{
            marginHorizontal: 16,
            backgroundColor: colors.bgCard,
            borderRadius: radii.modal,
            padding: spacing.md,
            gap: 14,
            alignItems: "center",
          }}
        >
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryTintBg, alignItems: "center", justifyContent: "center" }}>
            <Text size={24}>🔔</Text>
          </View>
          <Text size={fontSize.xl} weight="bold">
            {isFocusPreStart ? "Time to start" : "Time to work on"}
          </Text>
          <Text size={fontSize.bodyLg} weight="bold">
            {taskName}
          </Text>
          <Text size={26} weight="extraBold" color={colors.textMuted} style={{ fontVariant: ["tabular-nums"] }}>
            {time}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <CategoryTag category={category} />
            {intervalLabel ? (
              <View style={{ backgroundColor: colors.primaryTintBg, borderRadius: radii.pill, paddingVertical: 5, paddingHorizontal: 10 }}>
                <Text size={fontSize.tiny} weight="bold" color={colors.primaryTintText}>
                  {intervalLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ width: "100%", gap: 10, marginTop: 6 }}>
            <Button label={isFocusPreStart ? "Start now" : "Done ✓"} onPress={onPrimaryAction} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Snooze 15 min" variant="secondary" onPress={onSnooze} style={{ flex: 1 }} />
              <Button label={secondaryLabel} variant="secondary" onPress={onSecondaryAction} style={{ flex: 1 }} />
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
