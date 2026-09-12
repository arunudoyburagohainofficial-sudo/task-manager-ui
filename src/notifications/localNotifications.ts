import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { IntervalReminderDto, ReminderDto, TaskDto } from "../api/types";
import { REMINDER_CATEGORY, registerNotificationCategory } from "./notificationActions";
import {
  allocateFairly,
  intervalOccurrences,
  leadIn,
  MAX_PENDING,
  reminderOccurrences,
  type Scheduled,
} from "./schedulingLogic";

/**
 * Reminder delivery lives here, on the device — the backend stores reminders so they sync
 * across a user's devices and survive a reinstall, but it no longer decides when to fire
 * them. The phone does, using local notifications.
 *
 * Why not push from the server: a server sweep has to poll ("is anything due this
 * minute?"), needs an always-running instance to do it, and still depends on the network
 * to reach the device. A local notification is scheduled once and fires exactly on time,
 * offline, with no backend involved at all.
 *
 * The one real constraint: iOS allows an app only 64 pending local notifications. Every
 * scheduling decision below is shaped by that budget — see scheduleAll.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Must be granted before anything can be scheduled. Returns false when the user declines,
 * so callers can degrade gracefully rather than scheduling into a void.
 */
export async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  // Don't re-prompt someone who has explicitly said no and can't be asked again.
  if (!existing.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Android shows notifications silently unless they belong to a channel. */
export async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Task reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * Replaces every scheduled reminder with a fresh set derived from the server's data.
 *
 * Cancel-then-reschedule rather than incremental updates: the server is the source of
 * truth and a device can miss changes made elsewhere (another phone, or while offline),
 * so reconciling the whole set is the only way to be certain the device agrees with it.
 *
 * Call this after login and whenever the app returns to the foreground — the latter also
 * refreshes the rolling interval-reminder window as it advances.
 */
export function scheduleAll(
  reminders: ReminderDto[],
  intervals: IntervalReminderDto[],
  tasks: TaskDto[]
): Promise<number> {
  // Serialised against any run already in progress — see `pending` below.
  const result = pending.then(
    () => runScheduleAll(reminders, intervals, tasks),
    () => runScheduleAll(reminders, intervals, tasks)
  );
  // The chain itself must never hold a rejection, or every later call inherits it and
  // this queue jams permanently. Callers still see the real (possibly rejected) promise.
  pending = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/**
 * Tail of the run queue. scheduleAll is fired from a dozen places — every reminder
 * mutation, task completion, pull-to-refresh, sign-in, and every app foreground — and
 * most of those call it *unawaited* (`void syncReminders()`). Two overlapping runs used to
 * interleave destructively:
 *
 *   A: cancelAll -> schedules 1..10
 *   B: cancelAll                      <- wipes the 10 A just wrote
 *   B: schedules its own full set
 *   A: schedules 11..20               <- lands after B's cancel, so these are duplicates
 *
 * Chaining rather than dropping the second call matters: the later caller usually has
 * fresher data (it fired *because* something changed), so it must still run — just after,
 * never during.
 */
let pending: Promise<void> = Promise.resolve();

async function runScheduleAll(
  reminders: ReminderDto[],
  intervals: IntervalReminderDto[],
  tasks: TaskDto[]
): Promise<number> {
  if (!(await requestPermission())) return 0;
  await configureAndroidChannel();
  await registerNotificationCategory();

  const taskName = new Map(tasks.map((task) => [task.id, task.name]));
  const isPending = new Set(tasks.filter((t) => t.status === "pending").map((t) => t.id));
  // Every reminder used to announce itself as "Time to focus", including on reminder-type
  // tasks — "Time to focus / You planned to work on: Call the dentist" is the wrong sentence
  // for a task that has nothing to do with a focus session.
  const isFocusTask = new Set(tasks.filter((t) => t.taskType === "focus").map((t) => t.id));
  const scheduledFor = new Map(tasks.map((task) => [task.id, task.scheduledFor]));

  // One group per source, each already soonest-first — allocateFairly needs that shape,
  // and it's also what stops one noisy source from crowding out the rest.
  const groups: Scheduled[][] = [];

  for (const reminder of reminders) {
    // Skip anything stopped, or whose task is done — the server keeps these rows around
    // (see the backend's Reminder.isActive), but there is nothing left to schedule.
    if (!reminder.isActive || !isPending.has(reminder.taskId)) continue;
    const occurrences = reminderOccurrences(
      reminder.reminderTime,
      // The day is the task's, not the reminder's — since V017 there is only one date, so
      // these two can't drift apart the way two separate fields could.
      scheduledFor.get(reminder.taskId) ?? null,
      reminder.snoozedUntil,
      reminder.daysBefore ?? 0
    );
    if (!occurrences.length) continue;
    const focus = isFocusTask.has(reminder.taskId);
    groups.push(
      occurrences.map((at) => ({
        at,
        title: focus ? "Time to focus" : "Reminder",
        // A lead-time notification says so, otherwise "Buy Mum a gift" a week early reads as
        // if it's due now and there's nothing to distinguish it from the day-of nudge.
        body: leadIn(reminder.daysBefore ?? 0, taskName.get(reminder.taskId), focus),
        taskId: reminder.taskId,
        // Carried so the notification's Snooze button has something to address — the snooze
        // endpoint is keyed on the reminder, not the task.
        reminderId: reminder.id,
      }))
    );
  }

  for (const interval of intervals) {
    if (!interval.isActive || !isPending.has(interval.taskId)) continue;
    const occurrences = intervalOccurrences(interval);
    if (!occurrences.length) continue;
    groups.push(
      occurrences.map((at) => ({
        at,
        title: "Still on it?",
        body: `Checking in on: ${taskName.get(interval.taskId) ?? "your task"}`,
        taskId: interval.taskId,
      }))
    );
  }

  // Everything above is pure computation, and it deliberately happens *before* the cancel
  // below: cancelling first and then throwing while building would leave the device with
  // no notifications at all, and syncReminders swallows the error, so that loss would be
  // completely silent.
  const chosen = allocateFairly(groups, MAX_PENDING);
  chosen.sort((a, b) => a.at.getTime() - b.at.getTime());

  await Notifications.cancelAllScheduledNotificationsAsync();

  let scheduled = 0;
  for (const item of chosen) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: item.title,
          body: item.body,
          data: { taskId: item.taskId, reminderId: item.reminderId },
          // Attaches the Done / Snooze buttons and, on a tap, gives the response handler
          // the task to open — see notificationActions.ts.
          categoryIdentifier: REMINDER_CATEGORY,
          ...(Platform.OS === "android" ? { channelId: "reminders" } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.at,
        },
      });
      scheduled++;
    } catch {
      // One rejected notification (a bad date, a platform quota hiccup) must not abort the
      // rest — the alternative is losing every reminder after the first failure, having
      // already cancelled them all.
    }
  }

  return scheduled;
}

/** Clears everything — used on sign-out so the next account starts clean. */
export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
