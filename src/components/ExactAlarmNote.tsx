import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { openExactAlarmSettings, useExactAlarmState } from "../notifications/exactAlarms";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { radius, space } from "../theme";
import { AlertGlyph } from "./icons";
import { Meta } from "./Text";

/**
 * "This may ring late", said beside the time being set - the moment someone cares.
 *
 * Shown only when Android's "Alarms & reminders" switch is off (see exactAlarms.ts): the
 * reminder will still arrive, but batched, so possibly well after the minute it says. Nothing
 * at all where the switch is on or the build can't ask.
 */
export function ExactAlarmNote() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { state, refresh } = useExactAlarmState();
  if (state !== "off") return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="This may ring late. Turn on Alarms & reminders"
      onPress={async () => {
        await openExactAlarmSettings();
        refresh();
      }}
      style={styles.note}
    >
      <AlertGlyph size={14} color={theme.color.danger} />
      <View style={styles.text}>
        <Meta style={{ color: theme.color.danger, fontWeight: "700", lineHeight: 17 }}>
          May ring late - Alarms & reminders is off.
        </Meta>
        <Meta style={{ color: theme.surface.primary, fontWeight: "800", lineHeight: 17, marginTop: 2 }}>Turn on</Meta>
      </View>
    </Pressable>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    note: {
      flexDirection: "row",
      gap: space.sm,
      paddingHorizontal: space.base,
      paddingVertical: space.md,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: t.color.dangerBorder,
      backgroundColor: t.color.dangerFill,
    },
    text: {
      flex: 1,
    },
  });
