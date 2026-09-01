import * as Notifications from "expo-notifications";
import { remindersApi } from "../api";
import { queryClient } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { navigationRef } from "../navigation/navigationRef";
import { syncReminders } from "./useReminderSync";

/**
 * What a reminder notification can do once it has fired.
 *
 * Until this existed, a fired reminder was a dead end: tapping it opened the app to
 * whatever screen was last showing, with no way back to the task it was about, and the
 * backend's own `markTaskDone` endpoint — written specifically for "the user tapped Done on
 * a notification", per its comment — had no caller at all on the device. Snooze was in the
 * same state: the server stored `snoozedUntil`, and nothing on the phone ever set it or
 * read it back.
 */

/** Matches the identifier attached to every reminder we schedule. */
export const REMINDER_CATEGORY = "reminder-actions";

const DONE_ACTION = "reminder-done";

/**
 * Snooze lengths offered on the notification itself.
 *
 * One fixed 15 minutes was rarely the right answer — snoozing something at 9pm for a quarter
 * of an hour helps nobody. These three cover the situations people actually mean: "give me a
 * minute", "not right now", and "not today".
 *
 * Three is also the practical ceiling. Android shows up to three action buttons and iOS shows
 * two before hiding the rest behind a long-press, and "Done" already claims one slot — so a
 * fourth option would be invisible to most people on both platforms.
 */
const SNOOZE_OPTIONS = [
  { id: "reminder-snooze-15", label: "15m", minutes: 15 },
  { id: "reminder-snooze-60", label: "1h", minutes: 60 },
  { id: "reminder-snooze-tomorrow", label: "Tomorrow", minutes: null },
] as const;

/** Minutes from now until 9am tomorrow, computed at press time rather than stored. */
function minutesUntilTomorrowMorning(): number {
  const target = new Date();
  target.setDate(target.getDate() + 1);
  target.setHours(9, 0, 0, 0);
  return Math.max(1, Math.round((target.getTime() - Date.now()) / 60000));
}

/**
 * Registers the buttons that appear on a reminder notification.
 *
 * Both are marked as not opening the app: acting on a reminder from the shade is the whole
 * point, and forcing a foreground launch to press "Done" is most of the reason people stop
 * using reminders at all.
 */
export async function registerNotificationCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
    {
      identifier: DONE_ACTION,
      buttonTitle: "Done",
      options: { opensAppToForeground: false },
    },
    ...SNOOZE_OPTIONS.map((option) => ({
      identifier: option.id,
      buttonTitle: option.label,
      options: { opensAppToForeground: false },
    })),
  ]);
}

/**
 * Handles a tap on a notification, or on one of its action buttons.
 *
 * Every branch resyncs afterwards rather than patching the cache by hand: this can run
 * while the app is backgrounded or not running at all, where there may be no cache to patch
 * and no screen mounted to observe it. A full resync is also what re-arms the device's
 * pending notifications, which matters most in the case that changes them — completing a
 * repeating task, where the server has just minted a successor with its own reminder.
 */
export async function handleNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<void> {
  const data = response.notification.request.content.data as { taskId?: string; reminderId?: string };
  const taskId = data?.taskId;
  if (!taskId) return;

  try {
    if (response.actionIdentifier === DONE_ACTION) {
      await remindersApi.markTaskDone(taskId);
      queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
      queryClient.invalidateQueries({ queryKey: ["weeklyProgress"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.goals() });
      await syncReminders();
      return;
    }

    const snooze = SNOOZE_OPTIONS.find((option) => option.id === response.actionIdentifier);
    if (snooze) {
      // Keyed on the task: the notification is no longer a separately addressable resource,
      // so there's no reminder id to carry around or keep in step with the task.
      await remindersApi.snoozeTaskReminder(taskId, snooze.minutes ?? minutesUntilTomorrowMorning());
      await syncReminders();
      return;
    }

    // Plain tap — open the task it was about. Guarded because a notification tapped from a
    // cold start can arrive before the navigator has mounted.
    if (navigationRef.isReady()) {
      navigationRef.navigate("TaskDetail", { taskId });
    }
  } catch {
    // Offline, or the task was deleted elsewhere. Nothing useful to say from a background
    // handler with no UI attached; the next foreground sync reconciles it.
  }
}
