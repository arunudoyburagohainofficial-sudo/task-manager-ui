import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { readScheduledNotifications } from "./scheduledInspector";
import { syncReminders } from "./useReminderSync";

/**
 * Re-syncs reminders while the app is closed.
 *
 * Until this existed, a device only learned about changes made elsewhere when someone opened
 * the app. Two phones signed into one account each hold their own alarms, derived from the
 * same server data but set locally — so finishing a task on one left the other still armed,
 * with no way to reach it. A phone in a drawer would fire a reminder for work completed days
 * before. The window had no upper bound.
 *
 * This closes it to roughly a quarter of an hour on Android. It is deliberately the smallest
 * possible change: it calls the same `syncReminders` that a foreground already calls, so there
 * is no second copy of the scheduling rules to keep in step.
 *
 * Why not move delivery to the server instead, which would remove the problem rather than
 * bound it: see the note at the top of localNotifications.ts. A local alarm fires on time,
 * offline, with nothing running on our side. Push would make every reminder depend on the
 * network at the moment it is due, which trades a small bounded bug for a larger unbounded one.
 */
export const BACKGROUND_SYNC_TASK = "foyg-reminder-sync";

/**
 * How close is too close to rebuild.
 *
 * `scheduleAll` cancels the whole queue and writes it back, and there is a short gap between
 * the two. On a foreground that gap opens once, when the user is looking at the phone. Run
 * every fifteen minutes it opens roughly ninety times a day, and a reminder landing inside one
 * would simply never fire.
 *
 * So the task stands down when anything is about to go off. Skipping a sync costs nothing: the
 * next one is fifteen minutes away, and the alarm it declined to touch is already correctly
 * armed. Firing late is recoverable. Not firing is not.
 */
const IMMINENT_MS = 60_000;

/** True when the device is holding an alarm due within the next minute. */
async function somethingIsAboutToFire(): Promise<boolean> {
  try {
    const pending = await readScheduledNotifications();
    const soon = Date.now() + IMMINENT_MS;
    return pending.some((n) => n.at.getTime() <= soon);
  } catch {
    // Unreadable queue: treat it as imminent and skip. The cautious answer is the safe one.
    return true;
  }
}

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    if (await somethingIsAboutToFire()) return BackgroundTask.BackgroundTaskResult.Success;
    /*
     * Signed out, offline, or an expired token all end up here as a swallowed failure inside
     * syncReminders, which is the behaviour we want: do nothing and wait for the next turn,
     * leaving the device exactly as it was.
     */
    await syncReminders();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Asks the OS to run the task periodically.
 *
 * Fifteen minutes is Android's floor, not a preference — asking for less is silently rounded
 * up. iOS treats it as a hint and decides for itself based on how much the app is used, so the
 * interval there can be hours. That asymmetry is why this bounds the problem rather than
 * removing it.
 */
export async function startBackgroundSync(): Promise<void> {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (already) return;
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
  } catch {
    // Unsupported device, a simulator, or the OS refusing. The app is fully usable without it;
    // reminders simply go back to catching up when the app is opened.
  }
}

/**
 * Stops it on sign-out.
 *
 * Leaving it registered would have a signed-out phone waking every quarter hour to make
 * requests it cannot authenticate, which is battery spent on nothing.
 */
export async function stopBackgroundSync(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }
  } catch {
    // Nothing to undo if it was never registered.
  }
}
