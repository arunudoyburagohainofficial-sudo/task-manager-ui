import { useCallback, useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { remindersApi, tasksApi } from "../api";
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
    // Feeds the same fetch into the shared query cache (see src/api/queryClient.ts) so a
    // background sync — e.g. the app returning to the foreground — keeps every screen's
    // already-rendered data in step too, not just the device's scheduled notifications.
    queryClient.setQueryData(queryKeys.reminders(), reminders);
    queryClient.setQueryData(queryKeys.intervalReminders(), intervals);
    queryClient.setQueryData(queryKeys.tasks("pending"), tasks);
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

  const sync = useCallback(async () => {
    if (!user) return;
    await syncReminders();
  }, [user]);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") sync();
    });
    return () => subscription.remove();
  }, [sync]);
}
