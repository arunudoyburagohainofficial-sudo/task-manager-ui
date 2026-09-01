import { useCallback, useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { remindersApi, tasksApi } from "../api";
import { handleNotificationResponse } from "./notificationActions";
import { queryClient } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { useSession } from "../state/SessionContext";
import { scheduleAll } from "./localNotifications";

/**
 * Re-reads reminders from the server and reschedules the device's notifications to match.
 *
 * Exported separately from the hook so a screen can call it immediately after changing a
 * reminder — otherwise a reminder just created wouldn't actually be scheduled until the
 * app next returned to the foreground.
 *
 * Never throws: notification scheduling is a background concern and must not surface an
 * error over whatever the user is doing.
 */
export async function syncReminders(): Promise<void> {
  try {
    const [reminders, intervals, tasks] = await Promise.all([
      remindersApi.getReminders(),
      remindersApi.getIntervalReminders(),
      tasksApi.getTasks("pending"),
    ]);

    /**
     * Feeds the same fetch into the shared query cache (see src/api/queryClient.ts) so a
     * background sync keeps every screen's already-rendered data in step too, not just the
     * device's scheduled notifications.
     *
     * Skipped while any mutation is in flight. These writes replace whole lists, and this
     * function is fired unawaited from every completion — so completing two tasks in quick
     * succession could have the first one's sync land after the second's optimistic update
     * and put the second task back into the pending list, where it would sit until something
     * else refetched. A response that was already in flight before that mutation started is
     * stale by definition; dropping it costs nothing, because whatever ran the mutation
     * refreshes the cache itself.
     */
    if (queryClient.isMutating() === 0) {
      queryClient.setQueryData(queryKeys.reminders(), reminders);
      queryClient.setQueryData(queryKeys.intervalReminders(), intervals);
      queryClient.setQueryData(queryKeys.tasks("pending"), tasks);
    }

    // Scheduling still runs on the fetched data either way: a slightly stale notification
    // set self-corrects on the next sync, and skipping it entirely would be worse.
    await scheduleAll(reminders, intervals, tasks);
  } catch {
    // Offline, permission denied, or a transient API error — retried on next foreground.
  }
}

/**
 * Keeps the device's scheduled local notifications in step with the reminders held on the
 * server.
 *
 * Runs on sign-in and again whenever the app comes back to the foreground. The second
 * trigger is doing two jobs: picking up reminders changed on another device, and rolling
 * the interval-reminder window forward as time passes (only the next 24 hours of repeats
 * are ever materialised, to stay inside the platform's pending-notification budget).
 *
 * Failures are swallowed deliberately — the app is perfectly usable without notification
 * permission or connectivity, and this is a background concern that should never surface
 * an error over whatever the user is actually doing.
 */
export function useReminderSync(): void {
  const { user } = useSession();

  // Keyed on user?.id, not `user` as a whole — same reasoning as SessionContext's own
  // prefetch effect: updateUser (weekly goal, profile edits, ...) replaces the user object
  // without changing who's signed in, and shouldn't re-trigger a sync of unrelated data.
  const sync = useCallback(async () => {
    if (!user) return;
    await syncReminders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") sync();
    });
    return () => subscription.remove();
  }, [sync]);

  /**
   * Makes a fired reminder actionable — tapping it opens the task, and its Done / Snooze
   * buttons do what they say.
   *
   * Without this listener a reminder was a dead end: the notification appeared, and tapping
   * it dropped you wherever the app happened to be, with the task it was about nowhere in
   * sight.
   *
   * getLastNotificationResponseAsync covers the cold-start case, where the tap that launched
   * the app happened before this listener could exist. `handled` guards the overlap, since a
   * warm tap can arrive through both paths.
   */
  useEffect(() => {
    if (!user) return;
    let handled: string | null = null;

    const act = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier + response.actionIdentifier;
      if (handled === id) return;
      handled = id;
      void handleNotificationResponse(response);
    };

    Notifications.getLastNotificationResponseAsync().then(act).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(act);
    return () => subscription.remove();
  }, [user]);
}
