import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { IntervalReminderDto, ReminderDto, TaskDto } from "../api/types";

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

/** iOS hard limit is 64; stay under it so we never silently lose the tail of the queue. */
const MAX_PENDING = 50;

/** How far ahead repeating interval reminders are materialised. */
const INTERVAL_HORIZON_HOURS = 24;

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

/** "18:00:00" + optional "2026-08-14" -> the next Date at which that should fire. */
function nextOccurrence(time: string, date: string | null): Date | null {
  const [hours, minutes] = time.split(":").map(Number);

  if (date) {
    const at = new Date(`${date}T${time}`);
    return at.getTime() > Date.now() ? at : null; // a one-off in the past never fires again
  }

  // No date means "every day at this time" — take today's slot, or tomorrow's if it passed.
  const at = new Date();
  at.setHours(hours, minutes, 0, 0);
  if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
  return at;
}

/** Every firing time for an interval reminder within the horizon. */
function intervalOccurrences(interval: IntervalReminderDto): Date[] {
  const [startHour, startMinute] = interval.startTime.split(":").map(Number);
  const [endHour, endMinute] = interval.endTime.split(":").map(Number);
  const stepMinutes = interval.intervalMinutes > 0 ? interval.intervalMinutes : 30;

  const occurrences: Date[] = [];
  const horizon = Date.now() + INTERVAL_HORIZON_HOURS * 60 * 60 * 1000;

  // Walk today's window, then tomorrow's, until the horizon is reached.
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const cursor = new Date();
    cursor.setDate(cursor.getDate() + dayOffset);
    cursor.setHours(startHour, startMinute, 0, 0);

    const windowEnd = new Date(cursor);
    windowEnd.setHours(endHour, endMinute, 0, 0);

    while (cursor <= windowEnd) {
      const at = cursor.getTime();
      if (at > Date.now() && at <= horizon) occurrences.push(new Date(cursor));
      cursor.setMinutes(cursor.getMinutes() + stepMinutes);
    }
  }
  return occurrences;
}

type Scheduled = { at: Date; title: string; body: string; taskId: string };

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
export async function scheduleAll(
  reminders: ReminderDto[],
  intervals: IntervalReminderDto[],
  tasks: TaskDto[]
): Promise<number> {
  if (!(await requestPermission())) return 0;
  await configureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const taskName = new Map(tasks.map((task) => [task.id, task.name]));
  const isPending = new Set(tasks.filter((t) => t.status === "pending").map((t) => t.id));

  const queue: Scheduled[] = [];

  for (const reminder of reminders) {
    // Skip anything stopped, or whose task is done — the server keeps these rows around
    // (see the backend's Reminder.isActive), but there is nothing left to schedule.
    if (!reminder.isActive || !isPending.has(reminder.taskId)) continue;
    const at = nextOccurrence(reminder.reminderTime, reminder.reminderDate);
    if (!at) continue;
    queue.push({
      at,
      title: "Time to focus",
      body: `You planned to work on: ${taskName.get(reminder.taskId) ?? "your task"}`,
      taskId: reminder.taskId,
    });
  }

  for (const interval of intervals) {
    if (!interval.isActive || !isPending.has(interval.taskId)) continue;
    for (const at of intervalOccurrences(interval)) {
      queue.push({
        at,
        title: "Still on it?",
        body: `Checking in on: ${taskName.get(interval.taskId) ?? "your task"}`,
        taskId: interval.taskId,
      });
    }
  }

  // Soonest first, then truncate: if the budget is exceeded it must be the far-future
  // entries that get dropped, never the next one due. The rolling refresh picks up the
  // remainder later.
  queue.sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const item of queue.slice(0, MAX_PENDING)) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: item.title,
        body: item.body,
        data: { taskId: item.taskId },
        ...(Platform.OS === "android" ? { channelId: "reminders" } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.at,
      },
    });
  }

  return Math.min(queue.length, MAX_PENDING);
}

/** Clears everything — used on sign-out so the next account starts clean. */
export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
