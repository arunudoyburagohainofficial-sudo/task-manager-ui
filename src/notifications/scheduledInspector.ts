import * as Notifications from "expo-notifications";

/**
 * What the device is *actually* going to do.
 *
 * Everywhere else in the app, "your notifications" means the configuration held on the server.
 * This reads the other end: the real queue of pending local notifications the OS is holding,
 * which is the only thing that will genuinely fire.
 *
 * The two can legitimately differ, and that's the point of showing this:
 *  - the queue is capped (MAX_PENDING), so a busy account has configured notifications that
 *    simply aren't scheduled — the fair-share allocator drops the tail
 *  - a daily reminder is materialised several days ahead, so one configured notification
 *    appears here as several entries
 *  - anything already fired has left the queue
 *
 * Without this, the app pushes things into the OS that the user can neither see nor stop.
 */

export interface ScheduledNotification {
  /** The OS's own handle, unique per queued firing. */
  id: string;
  /** When it will actually fire. */
  at: Date;
  title: string;
  body: string;
  taskId: string | null;
  /**
   * Which configured notification produced it, when there is one. Absent for interval nudges,
   * which are configured as a window rather than as individual reminders.
   */
  reminderId: string | null;
  /** Interval nudges are a different mechanism and are cancelled differently. */
  kind: "reminder" | "nudge";
}

/** The device's pending queue, soonest first. Empty if permission was never granted. */
export async function readScheduledNotifications(): Promise<ScheduledNotification[]> {
  let raw: Notifications.NotificationRequest[];
  try {
    raw = await Notifications.getAllScheduledNotificationsAsync();
  } catch {
    // Never throws outward: this is an informational screen, and a device that won't answer
    // should show "nothing scheduled" rather than an error over the whole list.
    return [];
  }

  return raw
    .map((request) => {
      const data = (request.content.data ?? {}) as { taskId?: string; reminderId?: string };
      /*
       * Everything this app schedules uses a DATE trigger (see localNotifications.scheduleAll),
       * so anything without a resolvable instant isn't ours to display.
       *
       * Both spellings, because expo-notifications reports the instant as `value` on Android
       * (`{type: "date", value: 1790425800000, repeats: false}` — observed on an emulator running
       * 0.32.17) while `date` is the older/documented name. Reading only `date` meant every entry
       * was dropped and this screen said "Nothing queued" while the OS was holding seven alarms —
       * on the one screen whose whole promise is that it reads the device rather than the
       * configuration. Found 2026-09-26; invisible to the e2e suite, which runs on web where the
       * scheduler is a stub that legitimately returns nothing.
       */
      const trigger = request.trigger as { date?: number | string; value?: number | string } | null;
      const instant = trigger?.date ?? trigger?.value;
      const at = instant != null ? new Date(instant) : null;
      if (!at || Number.isNaN(at.getTime())) return null;

      return {
        id: request.identifier,
        at,
        title: request.content.title ?? "",
        body: request.content.body ?? "",
        taskId: data.taskId ?? null,
        reminderId: data.reminderId ?? null,
        // Interval nudges carry no reminderId — they come from a window, not a reminder row.
        kind: data.reminderId ? ("reminder" as const) : ("nudge" as const),
      };
    })
    .filter((n): n is ScheduledNotification => n !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * The queue's capacity, mirroring localNotifications.MAX_PENDING.
 *
 * iOS allows an app only 64 pending local notifications; the app budgets 50 and shares them
 * round-robin so one noisy task can't silence every other. Surfacing how full that is explains
 * why a configured notification might not appear in the list at all.
 */
export const NOTIFICATION_BUDGET = 50;
