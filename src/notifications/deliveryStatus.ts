/**
 * Why this phone won't deliver a notification — or null when it will.
 *
 * Three separate things had to be true before a notification reached the OS, and all three
 * failed the same way: `runScheduleAll` returned 0, every caller discarded it (`void
 * syncReminders()`), and the queue screen guessed at the reason in prose. Someone with a
 * correctly configured notification and a declined permission was told "that's expected if none
 * of your tasks have a notification" — the one explanation that couldn't be true.
 *
 * Found on a real phone, 2026-09-22: two notifications set up on a task due the next day, zero
 * queued, nothing anywhere saying why.
 *
 * This module holds the *decision* and the *wording* and imports nothing native, so both can be
 * checked without a device — same split as `schedulingLogic` against `localNotifications`, and
 * for a sharper reason here: the whole subject is a permission state a browser can't have.
 * `deliveryProbe.ts` is the half that reads the real device.
 */

export type DeliveryBlock =
  /** Settings → Reminder notifications is off. The user's own choice, and reversible in-app. */
  | "switch-off"
  /** The OS permission was declined, but Android will still let us ask. */
  | "permission-denied"
  /**
   * Declined and `canAskAgain` is false. Android only allows the prompt once, so this is
   * permanent from the app's side — the only way out is the system settings screen. This is the
   * dead end: nothing re-prompts, nothing reports it, and every sync from here on quietly does
   * nothing.
   */
  | "permission-blocked"
  /** expo-notifications has no scheduler in a browser — see ScheduledNotificationsScreen. */
  | "unsupported";

/** What the OS permission read reduces to, so the decision below needs no Expo types. */
export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * The decision itself.
 *
 * Order matters. The switch is checked first because it's the user's own choice and it already
 * short-circuits `runScheduleAll` before any permission prompt — reporting "permission denied"
 * to someone who simply turned reminders off would send them to the wrong screen.
 */
export function deliveryBlockFrom(
  supported: boolean,
  switchOn: boolean,
  permission: PermissionState
): DeliveryBlock | null {
  if (!supported) return "unsupported";
  if (!switchOn) return "switch-off";
  if (permission.granted) return null;
  return permission.canAskAgain ? "permission-denied" : "permission-blocked";
}

/** What to tell the user, and what the button that fixes it should say. */
export interface DeliveryBlockCopy {
  title: string;
  body: string;
  /** Null where there's nothing to press — a browser can't be fixed from inside itself. */
  action: string | null;
}

/**
 * Plain language, naming the thing that's actually wrong and what to do about it.
 *
 * `configured` is how many notifications the user has set up. It's in every message because it
 * is the whole point: "nothing is queued" is unremarkable on its own and alarming when you know
 * four notifications should be.
 */
export function deliveryBlockCopy(block: DeliveryBlock, configured: number): DeliveryBlockCopy {
  const count = `${configured} notification${configured === 1 ? "" : "s"}`;
  switch (block) {
    case "switch-off":
      return {
        title: `${count} set up, none queued`,
        body:
          "Reminder notifications are switched off in Settings, so nothing is scheduled. " +
          "Your notifications are saved and will come back the moment you switch it on.",
        action: "Open Settings",
      };
    case "permission-denied":
      return {
        title: `${count} set up, none queued`,
        body: "FOYG hasn't been allowed to send notifications on this phone yet.",
        action: "Allow notifications",
      };
    case "permission-blocked":
      return {
        title: `${count} set up, none queued`,
        body:
          "Notifications are turned off for FOYG in your phone's settings. Android only asks " +
          "once, so this has to be turned back on there.",
        action: "Open phone settings",
      };
    case "unsupported":
      return {
        title: "Not available in a browser",
        body:
          "Notifications are scheduled by the phone itself, and a browser can't do it. Your " +
          "notifications are saved and will work in the app on your phone — there's just no " +
          "device queue to show here.",
        action: null,
      };
  }
}
