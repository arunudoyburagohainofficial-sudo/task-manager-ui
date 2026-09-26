import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ApiError } from "../api/client";
import {
  useDeleteIntervalReminderMutation,
  useIntervalRemindersQuery,
  useRemindersQuery,
} from "../api/queries/useReminders";
import { useTasksQuery, useUpdateTaskMutation } from "../api/queries/useTasks";
import {
  BackLink,
  Body,
  Card,
  H1,
  Meta,
  ProgressBar,
  ScreenContainer,
} from "../components";
import { syncReminders } from "../notifications/useReminderSync";
import { deliveryBlockCopy, type DeliveryBlock } from "../notifications/deliveryStatus";
import { readDeliveryBlock, SCHEDULING_SUPPORTED } from "../notifications/deliveryProbe";
import { requestPermission } from "../notifications/localNotifications";
import {
  NOTIFICATION_BUDGET,
  readScheduledNotifications,
  type ScheduledNotification,
} from "../notifications/scheduledInspector";
import { radius, space, text as t, type as T } from "../theme";
import { useTheme, useThemedStyles, type Tokens } from "../state/ThemeContext";
import { formatScheduleDate, toDateKey } from "../utils/schedule";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Whether this platform can queue a local notification at all.
 *
 * On web expo-notifications resolves its scheduler to a stub with neither
 * scheduleNotificationAsync nor getAllScheduledNotificationsAsync, so every scheduling call
 * throws and the queue is permanently empty — regardless of what the user has set up. Worth
 * naming explicitly, because "no notifications queued" and "this device will never queue one"
 * look identical from here and mean completely different things to the person reading it.
 */
const SCHEDULING_UNSUPPORTED = !SCHEDULING_SUPPORTED;

/**
 * Everything the phone is actually going to buzz about, and a way to stop any of it.
 *
 * The app schedules local notifications directly with the OS, which means it can queue things
 * the user can neither see nor call off — the notification centre shows them only once they've
 * fired, and by then it's too late. This is the missing view: the real pending queue, read from
 * the device rather than inferred from the server.
 *
 * Cancelling here deliberately changes the *configuration*, not just the queued firing. A
 * purely local cancel would be undone within seconds: every foreground runs syncReminders,
 * which clears the queue and rebuilds it from server state, so the notification would silently
 * come back. Turning it off for real is the only honest meaning of a cancel button here.
 */
export function ScheduledNotificationsScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const [scheduled, setScheduled] = useState<ScheduledNotification[]>([]);
  const [block, setBlock] = useState<DeliveryBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const tasksQuery = useTasksQuery("pending");
  const remindersQuery = useRemindersQuery();
  const intervalsQuery = useIntervalRemindersQuery();
  const updateTaskMutation = useUpdateTaskMutation();
  const deleteNudgeMutation = useDeleteIntervalReminderMutation();

  const load = useCallback(async () => {
    // Read together, because the pair is the answer: an empty queue means one thing when
    // delivery is working and something else entirely when it isn't.
    const [queue, blocked] = await Promise.all([readScheduledNotifications(), readDeliveryBlock()]);
    setScheduled(queue);
    setBlock(blocked);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await syncReminders();
    await load();
    setRefreshing(false);
  }

  /**
   * The one button that fixes whatever is blocking delivery.
   *
   * Each case goes somewhere different, and sending people to the wrong one is most of why this
   * was worth building: the phone's settings screen is no use to someone who turned the app's
   * own switch off, and the app's switch is no use once Android has stopped asking.
   */
  async function resolveBlock() {
    if (block === "switch-off") {
      navigation.navigate("Main", { screen: "Settings" });
      return;
    }
    if (block === "permission-denied") {
      // Android allows this prompt once. If it's taken and declined, the next read comes back
      // as "permission-blocked" and the button becomes the settings link instead.
      await requestPermission();
      await syncReminders();
      await load();
      return;
    }
    if (block === "permission-blocked") {
      await Linking.openSettings().catch(() => undefined);
    }
  }

  const taskName = new Map((tasksQuery.data ?? []).map((task) => [task.id, task.name]));

  /**
   * Turns off the configured notification behind a queued firing.
   *
   * A daily reminder appears in the queue several times (one per day materialised ahead), and
   * all of those come from a single configured notification — so cancelling any one of them
   * turns off that notification entirely rather than skipping one morning. Said plainly in the
   * confirmation, because "cancel" could otherwise be read as "just this one".
   */
  async function cancelReminder(item: ScheduledNotification) {
    // Every other live notification on the task — the set is sent whole, so turning one off is
    // "here is what's left" rather than a delete of one row.
    const remaining = (remindersQuery.data ?? [])
      .filter((r) => r.taskId === item.taskId && r.isActive && r.id !== item.reminderId && r.reminderTime)
      .map((r) => ({ time: r.reminderTime as string, daysBefore: r.daysBefore ?? 0 }));

    try {
      await updateTaskMutation.mutateAsync({
        taskId: item.taskId as string,
        request: remaining.length > 0 ? { notifications: remaining } : { clearNotify: true },
      });
      await syncReminders();
      await load();
    } catch (e) {
      Alert.alert(
        "Couldn't turn it off",
        e instanceof ApiError ? e.message : "Check your connection and try again."
      );
    }
  }

  async function cancelNudge(item: ScheduledNotification) {
    const window = (intervalsQuery.data ?? []).find((r) => r.taskId === item.taskId && r.isActive);
    if (!window) return;
    try {
      await deleteNudgeMutation.mutateAsync(window.id);
      await syncReminders();
      await load();
    } catch (e) {
      Alert.alert(
        "Couldn't stop the nudges",
        e instanceof ApiError ? e.message : "Check your connection and try again."
      );
    }
  }

  function confirmCancel(item: ScheduledNotification) {
    const name = (item.taskId && taskName.get(item.taskId)) || "this task";
    const isNudge = item.kind === "nudge";
    // How many other queued firings share this configuration — the number that will also
    // disappear, which is the thing a "cancel" button could easily mislead about.
    const siblings = scheduled.filter(
      (other) =>
        other.id !== item.id &&
        (isNudge ? other.taskId === item.taskId && other.kind === "nudge" : other.reminderId === item.reminderId)
    ).length;

    Alert.alert(
      isNudge ? "Stop these nudges?" : "Turn off this notification?",
      isNudge
        ? `“${name}” will stop nudging you. The task itself stays exactly as it is.`
        : siblings > 0
          ? `This turns the notification off for “${name}” — including the ${siblings} other ` +
            `time${siblings === 1 ? "" : "s"} it's already queued to fire. The task itself stays as it is.`
          : `“${name}” won't notify you. The task itself stays exactly as it is.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: isNudge ? "Stop nudges" : "Turn off",
          style: "destructive",
          onPress: () => (isNudge ? cancelNudge(item) : cancelReminder(item)),
        },
      ]
    );
  }

  // Grouped by the day they fire, so the list reads as a forecast rather than a flat dump.
  const byDay = scheduled.reduce<Record<string, ScheduledNotification[]>>((acc, item) => {
    const key = toDateKey(item.at);
    (acc[key] ??= []).push(item);
    return acc;
  }, {});
  const days = Object.keys(byDay).sort();

  const used = scheduled.length;
  const busy = updateTaskMutation.isPending || deleteNudgeMutation.isPending;

  /**
   * How many notifications the user has actually set up — the number that makes an empty queue
   * either unremarkable or alarming. Counted from the server's reminders rather than the device,
   * because the whole question here is why the device disagrees with them.
   */
  const configured =
    (remindersQuery.data ?? []).filter((r) => r.isActive && r.reminderTime).length +
    (intervalsQuery.data ?? []).filter((r) => r.isActive).length;
  // Nothing set up and nothing queued is the ordinary case, not a fault — say so plainly rather
  // than explaining a permission the user has no reason to care about yet.
  const blockCopy = block && configured > 0 ? deliveryBlockCopy(block, configured) : null;

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <BackLink onPress={() => navigation.goBack()} />
        <H1>Upcoming notifications</H1>
        <Meta style={{ color: theme.color.textFaint }}>
          Exactly what your phone is queued to buzz about — read from the device itself, not from
          what's set up. Pull down to refresh.
        </Meta>

        {/*
          The budget is shown because it genuinely changes what happens: the queue is capped,
          and once it's full the fair-share allocator drops the tail. Someone whose reminder
          never arrived deserves to be able to see why rather than assume the app is broken.

          Hidden where nothing can be scheduled at all — "0 of 50 slots used" invites the
          reader to conclude they have room to spare, which is the opposite of the truth.
        */}
        {SCHEDULING_UNSUPPORTED ? null : (
          <Card style={styles.budgetCard}>
            <View style={styles.budgetRow}>
              <Body style={{ fontWeight: "700" }}>
                {used} of {NOTIFICATION_BUDGET} slots used
              </Body>
              <Meta style={{ color: used >= NOTIFICATION_BUDGET ? theme.color.danger : theme.color.textFaint }}>
                {used >= NOTIFICATION_BUDGET ? "Full" : `${NOTIFICATION_BUDGET - used} free`}
              </Meta>
            </View>
            <ProgressBar
              pct={(used / NOTIFICATION_BUDGET) * 100}
              fill={used >= NOTIFICATION_BUDGET ? theme.color.danger : theme.color.progress}
            />
            {used >= NOTIFICATION_BUDGET ? (
              <Meta style={{ color: theme.color.danger }}>
                The queue is full, so some notifications you've set up aren't scheduled. Turning a
                few off here frees up room for the rest.
              </Meta>
            ) : null}
          </Card>
        )}

        {loading ? (
          <Meta style={{ color: theme.color.textFaint }}>Reading the queue…</Meta>
        ) : days.length === 0 ? (
          /*
            Three different empty queues, and they used to read as one.

            The old copy hedged — "expected if none of your tasks have a notification, or if
            permission was declined" — which is no use to the person it's aimed at: someone
            looking at this screen already knows whether they set one up, and the app already
            knows too. Worse, when delivery was genuinely blocked it offered the reason as one
            possibility among two and gave nothing to press.

            Now: if something is set up and can't be delivered, say exactly what's wrong and
            put the fix on the card. Otherwise there's genuinely nothing to report.
          */
          <Card style={styles.emptyCard}>
            <Body style={{ fontWeight: "700" }}>{blockCopy ? blockCopy.title : "Nothing queued"}</Body>
            <Meta style={styles.emptyText}>
              {blockCopy
                ? blockCopy.body
                : configured > 0
                  ? "Everything you've set up is either already fired or waiting on a task whose " +
                    "day has passed. Move the task forward and it'll be queued again."
                  : "None of your tasks have a notification yet. Open a task and set one, and " +
                    "it'll show up here."}
            </Meta>
            {blockCopy?.action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={blockCopy.action}
                style={styles.blockAction}
                onPress={resolveBlock}
              >
                <Text style={t(T.body, { fontWeight: "800", color: theme.color.onInteractive })}>
                  {blockCopy.action}
                </Text>
              </Pressable>
            ) : null}
          </Card>
        ) : (
          days.map((dayKey) => (
            <View key={dayKey} style={styles.dayGroup}>
              <Text style={t(T.eyebrow, { fontSize: 11, letterSpacing: 1.32, color: theme.color.textMuted })}>
                {formatScheduleDate(dayKey).toUpperCase()}
              </Text>
              {byDay[dayKey].map((item) => (
                <Card key={item.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Body style={{ fontWeight: "700" }} numberOfLines={1}>
                      {(item.taskId && taskName.get(item.taskId)) || item.title || "Notification"}
                    </Body>
                    <Meta style={{ color: theme.color.textFaint, marginTop: 2 }} numberOfLines={2}>
                      {item.at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      {item.kind === "nudge" ? " · repeated nudge" : ""}
                      {item.body ? ` · ${item.body}` : ""}
                    </Meta>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Turn off this notification"
                    hitSlop={8}
                    disabled={busy}
                    onPress={() => confirmCancel(item)}
                  >
                    <Meta style={{ color: busy ? theme.color.textFaint : theme.color.danger, fontWeight: "800" }}>
                      Turn off
                    </Meta>
                  </Pressable>
                </Card>
              ))}
            </View>
          ))
        )}

        {/*
          Stated rather than left to be discovered: a daily reminder legitimately appears here
          several times, and without saying so the list looks duplicated or broken.
        */}
        {days.length > 0 ? (
          <Meta style={{ color: theme.color.textFaint }}>
            A repeating notification appears once for each day it's queued ahead. Turning one off
            turns off all of them for that task.
          </Meta>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (t: Tokens) =>
  StyleSheet.create({
    content: {
      padding: space.gutter,
      gap: space.md,
      paddingBottom: space.lg,
    },
    budgetCard: {
      gap: space.sm,
    },
    budgetRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    dayGroup: {
      gap: space.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
    },
    rowText: {
      flex: 1,
    },
    emptyCard: {
      gap: space.sm,
    },
    blockAction: {
      marginTop: space.xs,
      alignSelf: "flex-start",
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      backgroundColor: t.color.interactive,
    },
    emptyText: {
      color: t.color.textFaint,
    },
  });
