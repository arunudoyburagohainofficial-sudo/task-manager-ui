import { Platform } from "react-native";

/**
 * Android's "ring at exactly this time" permission, and the one screen that controls it.
 *
 * Android schedules an alarm one of two ways. An *exact* alarm fires at the moment it was
 * booked. An *inexact* one is batched with everyone else's and fires whenever the phone is
 * next awake, which under Doze can be a long time later. expo-notifications picks between
 * them silently: it asks the system whether exact alarms are allowed and, if they are not,
 * falls back to the inexact call with no error and nothing in the log. A 9:45 reminder
 * arriving at 10:15 is that fallback, working as designed.
 *
 * Two permissions decide the answer, and which one applies depends on the phone:
 *
 *  - SCHEDULE_EXACT_ALARM is the general one. Android 14 and later deny it on install, so
 *    an app that only declares it gets the inexact path until the user goes and turns it on.
 *  - USE_EXACT_ALARM is for apps whose job is reminding you at a time. It is granted on
 *    install with no prompt. Both are declared in app.json, so a current phone should take
 *    the exact path without anyone doing anything.
 *
 * This module exists for the cases that leaves: an Android 12 or 13 phone where the user has
 * revoked the first permission, and the possibility that Google ever objects to the second
 * and it has to come out. In both, the switch is in one system screen and the app's job is
 * to be able to open it.
 *
 * It deliberately cannot *read* the current state. expo-notifications 0.32 (the version
 * Expo SDK 54 pins) exposes nothing to JavaScript - getExactAlarmPermissionsAsync arrived in
 * a later major that needs a newer SDK. So nothing here claims to know whether the permission
 * is on, and the Settings row that uses it is worded as a route rather than as a diagnosis.
 */

/** True only where the permission and its settings screen exist at all. */
export const EXACT_ALARMS_ARE_A_THING = Platform.OS === "android";

/**
 * Opens Android's "Alarms & reminders" screen for this app.
 *
 * Returns false if it could not be opened, which is not worth an error to the user: the
 * screen is a convenience, and on a phone that auto-granted the permission there may be
 * nothing there to change. The caller says so quietly instead.
 */
export async function openExactAlarmSettings(): Promise<boolean> {
  if (!EXACT_ALARMS_ARE_A_THING) return false;
  try {
    // Imported here rather than at module scope so the module stays safe to load on web,
    // where the native side of expo-intent-launcher does not exist.
    const IntentLauncher = await import("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM
    );
    return true;
  } catch {
    return false;
  }
}
