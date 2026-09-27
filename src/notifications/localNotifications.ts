import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { IntervalReminderDto, ReminderDto, TaskDto } from "../api/types";
import { REMINDER_CATEGORY, registerNotificationCategory } from "./notificationActions";
import { readNotificationsEnabled } from "./preference";
import { MAX_PENDING, planQueue } from "./schedulingLogic";

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

/**
 * The app's own notification sound — see scripts/make-notification-sound.py, which generates it.
 *
 * A chime rather than the system default, because the default is the same ping the user's email,
 * bank and supermarket app all make. This one has to be recognisable from the next room as
 * "that's my reminder, time to start".
 */
export const REMINDER_SOUND = "foyg_chime.wav";

/**
 * The channel id. Versioned, and that is not cosmetic.
 *
 * An Android notification channel's sound, importance and vibration are fixed at creation and
 * cannot be changed afterwards — calling setNotificationChannelAsync again on a channel the user
 * already has is a no-op for those fields. So shipping a new sound to existing installs means
 * shipping a *new channel*; reusing "reminders" would have left everyone who already had the app
 * on the system default while new installs got the chime, which is exactly the sort of
 * difference nobody would think to test for.
 *
 * Bump this whenever the sound or importance changes, and add the old id to RETIRED_CHANNELS.
 */
const CHANNEL_ID = "reminders-v2";

/**
 * Channels this app used to use. Deleted on startup so they don't sit in the user's notification
 * settings as dead entries they can still toggle and be confused by.
 */
const RETIRED_CHANNELS = ["reminders"];

/** Android shows notifications silently unless they belong to a channel. */
export async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Task reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: REMINDER_SOUND,
  });
  for (const retired of RETIRED_CHANNELS) {
    await Notifications.deleteNotificationChannelAsync(retired).catch(() => undefined);
  }
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
  /*
   * The Settings switch. It used to be stored and never read — reminders kept arriving after
   * someone turned them off. Checked before asking for permission (no prompt for someone who has
   * opted out), and it still clears the queue, so switching off removes what was already there.
   */
  const enabled = await readNotificationsEnabled();
  if (!enabled) {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
    return 0;
  }
  /*
   * Asking is still done here rather than through readDeliveryBlock, which deliberately never
   * prompts — this is the one path where a prompt is wanted, because the user has just done
   * something that needs delivering. The two agree on what counts as blocked: both reduce to
   * granted/canAskAgain, and deliveryBlockFrom is the single statement of the rule.
   */
  if (!(await requestPermission())) return 0;
  await configureAndroidChannel();
  await registerNotificationCategory();

  // Everything above the OS call is pure computation — planQueue — and it deliberately happens
  // *before* the cancel below: cancelling first and then throwing while building would leave the
  // device with no notifications at all, and syncReminders swallows the error, so that loss would
  // be completely silent.
  const chosen = planQueue(reminders, intervals, tasks, MAX_PENDING, enabled);

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
          /*
           * iOS takes the sound per notification; Android takes it from the channel and ignores
           * this. Set on both so neither platform falls back to the system default, and so the
           * one place to change the sound is REMINDER_SOUND.
           */
          sound: REMINDER_SOUND,
          ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
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
