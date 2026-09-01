import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { IntervalReminderDto, ReminderDto, TaskDto } from "../api/types";
import { REMINDER_CATEGORY, registerNotificationCategory } from "./notificationActions";

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

/**
 * How many days of a repeating daily reminder are queued at once. Previously only the very
 * next one was, which meant a daily reminder stopped firing entirely if the app wasn't
 * opened between two firings — nothing re-arms it except a foreground (see useReminderSync).
 * A week of headroom means the app has to go unopened for seven days before that happens.
 */
const DAILY_HORIZON_DAYS = 7;

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
 * Every upcoming firing time for a single reminder, soonest first.
 *
 * A dated reminder yields at most one; a daily one (no date) yields DAILY_HORIZON_DAYS of
 * them. Built by copying the first slot and stepping the *date* rather than adding 24h of
 * milliseconds, so a daily 9am reminder stays 9am across a DST change instead of drifting
 * to 8am or 10am.
 */
function reminderOccurrences(
  time: string | null,
  date: string | null,
  snoozedUntil?: string | null,
  daysBefore: number = 0
): Date[] {
  // A reminder with a date but no time is deliberately silent: it exists to carry the task's
  // day, not to interrupt anyone. Nothing to schedule, so it produces no firing times at all.
  if (!time) return [];

  const [hours, minutes] = time.split(":").map(Number);

  /**
   * A live snooze replaces the reminder's own schedule until it expires.
   *
   * Previously this function never saw `snoozedUntil` at all, so snoozing wrote a value the
   * server stored and the device then completely ignored — the notification came back at
   * its original time regardless, which is the one thing a snooze must not do.
   */
  if (snoozedUntil) {
    const until = new Date(snoozedUntil);
    if (until.getTime() > Date.now()) return [until];
  }

  if (date) {
    const at = new Date(`${date}T${time}`);
    // Offsets are subtracted here rather than stored as dates, so "a week before" follows the
    // task automatically when its day moves — see V018. setDate handles month and year
    // boundaries, and DST is unaffected because the clock time is re-applied by the string.
    if (daysBefore > 0) at.setDate(at.getDate() - daysBefore);
    // A one-off in the past never fires again. That covers a lead-time notification whose
    // offset lands before today — a task created two days out with a week-before warning
    // simply doesn't get that one, rather than firing it late.
    return at.getTime() > Date.now() ? [at] : [];
  }

  // No date means "every day at this time" — start at today's slot, or tomorrow's if it passed.
  const first = new Date();
  first.setHours(hours, minutes, 0, 0);
  if (first.getTime() <= Date.now()) first.setDate(first.getDate() + 1);

  const occurrences: Date[] = [];
  for (let dayOffset = 0; dayOffset < DAILY_HORIZON_DAYS; dayOffset++) {
    const at = new Date(first);
    at.setDate(at.getDate() + dayOffset);
    occurrences.push(at);
  }
  return occurrences;
}

/** Every firing time for an interval reminder within the horizon, soonest first. */
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
    // An end time at or before the start means the window crosses midnight ("22:00 to
    // 02:00"). Without this the loop below never runs and such a reminder silently
    // produces nothing at all.
    if (windowEnd <= cursor) windowEnd.setDate(windowEnd.getDate() + 1);

    while (cursor <= windowEnd) {
      const at = cursor.getTime();
      if (at > Date.now() && at <= horizon) occurrences.push(new Date(cursor));
      cursor.setMinutes(cursor.getMinutes() + stepMinutes);
    }
  }
  return occurrences;
}

type Scheduled = { at: Date; title: string; body: string; taskId: string; reminderId?: string };

/**
 * The notification body, which has to say *when* the task is actually due when the
 * notification is firing ahead of time.
 *
 * Without this a week-before warning and the day-of nudge are word-for-word identical, so the
 * early one reads as "this is due now" and the user either acts a week early or learns to
 * ignore both.
 */
function leadIn(daysBefore: number, name: string | undefined, focus: boolean): string {
  const task = name ?? (focus ? "your task" : "Your task");
  if (daysBefore <= 0) return focus ? `You planned to work on: ${task}` : task;
  if (daysBefore === 1) return `${task} — due tomorrow`;
  if (daysBefore === 7) return `${task} — due in a week`;
  return `${task} — due in ${daysBefore} days`;
}

/**
 * Picks which occurrences fit inside MAX_PENDING, fairly, by taking one from every source
 * before taking a second from any of them.
 *
 * A plain "sort everything by time, truncate" is what a single busy source needs to starve
 * every other one: an interval reminder nudging every 15 minutes from 9am to 9pm generates
 * ~49 occurrences, all sooner than tomorrow morning's daily reminders, so it would consume
 * the entire budget and silently drop every other task's reminder. Round-robin guarantees
 * each source's *next* firing is scheduled before any source's second one — so no task
 * ever goes completely silent because another task is noisy.
 *
 * `groups` must each already be sorted soonest-first.
 */
function allocateFairly(groups: Scheduled[][], budget: number): Scheduled[] {
  const picked: Scheduled[] = [];
  const deepest = groups.reduce((max, group) => Math.max(max, group.length), 0);

  for (let round = 0; round < deepest && picked.length < budget; round++) {
    for (const group of groups) {
      if (round >= group.length) continue;
      picked.push(group[round]);
      if (picked.length >= budget) break;
    }
  }
  return picked;
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
