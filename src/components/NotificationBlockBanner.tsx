import React, { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useIntervalRemindersQuery, useRemindersQuery } from "../api/queries/useReminders";
import type { DeliveryBlock } from "../notifications/deliveryStatus";
import { readDeliveryBlock } from "../notifications/deliveryProbe";
import { requestPermission } from "../notifications/localNotifications";
import { syncReminders } from "../notifications/useReminderSync";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { radius, space, text as t, type as T } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * "Your reminders aren't going to fire", said where someone will actually see it.
 *
 * The Upcoming notifications screen explains this properly, but only to someone who went
 * looking — and nobody goes looking for a notification that hasn't arrived yet. The failure
 * this covers is entirely silent otherwise: notifications configured, permission declined,
 * every sync quietly scheduling nothing, and the app showing no sign of it anywhere.
 *
 * Deliberately not dismissible. It isn't advice, it's a broken state, and it disappears the
 * moment it stops being true.
 *
 * Renders nothing at all when delivery works or when nothing is set up to deliver — an empty
 * queue is only worth mentioning to someone expecting it to be full.
 */
export function NotificationBlockBanner() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const [block, setBlock] = useState<DeliveryBlock | null>(null);

  const remindersQuery = useRemindersQuery();
  const intervalsQuery = useIntervalRemindersQuery();

  const refresh = useCallback(async () => {
    setBlock(await readDeliveryBlock());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /*
   * Re-read on every foreground. Turning the permission back on happens in the phone's own
   * settings, so the app is in the background exactly when the thing this banner reports gets
   * fixed — without this it would sit there contradicting a setting the user had just changed.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const configured =
    (remindersQuery.data ?? []).filter((r) => r.isActive && r.reminderTime).length +
    (intervalsQuery.data ?? []).filter((r) => r.isActive).length;

  // "unsupported" is left out on purpose: on web there is nothing the reader can do about it,
  // and the queue screen already explains it where it's relevant.
  if (!block || block === "unsupported" || configured === 0) return null;

  const label =
    block === "switch-off"
      ? "Reminder notifications are switched off"
      : "FOYG can't send notifications on this phone";

  async function resolve() {
    if (block === "switch-off") {
      navigation.navigate("Main", { screen: "Settings" });
      return;
    }
    if (block === "permission-denied") {
      await requestPermission();
      await syncReminders();
      await refresh();
      return;
    }
    await Linking.openSettings().catch(() => undefined);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap to fix.`}
      onPress={resolve}
      style={styles.banner}
    >
      <View style={styles.text}>
        <Text style={t(T.body, { fontWeight: "800", color: theme.color.danger })}>{label}</Text>
        <Text style={t(T.meta, { color: theme.color.textMuted, marginTop: 2 })}>
          {configured} set up, none will fire. Tap to fix.
        </Text>
      </View>
      <Text style={t(T.body, { fontWeight: "800", color: theme.color.danger })}>›</Text>
    </Pressable>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      padding: space.md,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: t.color.dangerBorder,
      backgroundColor: t.color.dangerFill,
    },
    text: {
      flex: 1,
    },
  });
