import React from "react";
import { Modal, StyleSheet, View } from "react-native";
import { space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { Button } from "./Button";
import { Badge } from "./primitives";
import { ReminderIcon } from "./icons";
import { Body, H2, Meta } from "./Text";
import { Text } from "react-native";

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
 * In-app equivalent of the reminder notification. Kept as a standalone component so it's
 * ready to invoke from a notification-tap handler.
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
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ReminderIcon size={32} />
          <H2 style={styles.centered}>{isFocusPreStart ? "Time to start" : "Time to work on"}</H2>
          <Body style={[styles.centered, { fontWeight: "700", color: theme.color.text }]}>{taskName}</Body>
          <Text style={t(T.h1, { color: theme.color.textMuted, textAlign: "center" })}>{time}</Text>

          {intervalLabel ? <Badge label={intervalLabel} /> : null}

          <View style={styles.actions}>
            <Button label={isFocusPreStart ? "Start now" : "Done ✓"} onPress={onPrimaryAction} />
            <View style={styles.actionRow}>
              <Button label="Snooze 15 min" variant="secondary" onPress={onSnooze} style={styles.actionFlex} />
              <Button label={secondaryLabel} variant="secondary" onPress={onSecondaryAction} style={styles.actionFlex} />
            </View>
          </View>

          <Meta style={[styles.centered, { color: theme.color.textFaint }]}>
            {isFocusPreStart
              ? "This is just a nudge — starting the session is still up to you"
              : "Done stops all nudges · Stop keeps the task open"}
          </Meta>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(26,26,26,.42)",
      justifyContent: "center",
      paddingHorizontal: space.gutter,
    },
    card: {
      backgroundColor: t.color.card,
      borderRadius: 16,
      padding: 22,
      gap: space.base,
      alignItems: "center",
    },
    centered: {
      textAlign: "center",
    },
    actions: {
      width: "100%",
      gap: space.md,
      marginTop: space.xs,
    },
    actionRow: {
      flexDirection: "row",
      gap: space.md,
    },
    actionFlex: {
      flex: 1,
    },
  });
