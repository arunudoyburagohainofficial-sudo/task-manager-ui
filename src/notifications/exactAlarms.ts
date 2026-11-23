import Constants from "expo-constants";
import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { canScheduleExactAlarms } from "../../modules/focus-shield";

/**
 * Android's "ring at exactly this time" permission - "Alarms & reminders" in its settings - and
 * the app's one way of knowing whether it has it.
 *
 * Android schedules an alarm one of two ways. An *exact* alarm fires at the moment it was
 * booked. An *inexact* one is batched with everyone else's and fires whenever the phone is
 * next awake, which under Doze can be a long time later. expo-notifications picks between
 * them silently: it asks the system whether exact alarms are allowed and, if they are not,
 * falls back to the inexact call with no error and nothing in the log. A 9:45 reminder
 * arriving at 10:15 is that fallback, working as designed.
 *
 * The app holds SCHEDULE_EXACT_ALARM and nothing else. Android 13+ does not grant it to a fresh
 * install, so the user has to switch it on once, on a system screen - there is no prompt for it.
 * The other permission, USE_EXACT_ALARM, is granted on install but Google Play only allows it
 * for alarm-clock and calendar apps; it was declared from 2026-11-08 and taken out again before
 * the first store submission, because a reminder app is not on that list and a rejection costs
 * days. With the switch on, the two book exactly the same alarm.
 *
 * Reading the switch goes through the focus-shield module's native code, because the
 * expo-notifications that SDK 54 pins exposes nothing for it. An earlier version of this file
 * said the state could not be read at all; it could, just not through that library.
 *
 * Granting it needs no further work here: every time the app comes back to the front,
 * useReminderSync cancels and re-books every reminder, and expo-notifications asks the system
 * afresh for each one - so returning from the settings screen turns them all exact. Revoking it
 * stops the app and cancels its exact alarms (Android's own behaviour), and the next launch
 * re-books them inexact and reads "off" here.
 */

/** True only where the permission and its settings screen exist at all. */
export const EXACT_ALARMS_ARE_A_THING = Platform.OS === "android";

/**
 * Where the switch exists. Android 12 (API 31) introduced it; below that every alarm may be exact
 * and there is nothing to ask for.
 */
export const EXACT_ALARMS_NEED_ASKING =
  Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version >= 31;

/**
 * - "on"      reminders will ring at their minute.
 * - "off"     they will be batched and can arrive late; the user can fix it.
 * - "unknown" this build cannot ask - web, iOS, Expo Go. Nothing should be claimed either way.
 */
export type ExactAlarmState = "on" | "off" | "unknown";

/** The switch as Android sees it right now. Never cached: the user can change it at any time. */
export function readExactAlarmState(): ExactAlarmState {
  let allowed: boolean | null = null;
  try {
    allowed = canScheduleExactAlarms();
  } catch {
    // A build whose native side predates the check. Saying nothing beats saying something wrong.
    allowed = null;
  }
  if (allowed == null) return "unknown";
  return allowed ? "on" : "off";
}

/**
 * The switch, kept current. Re-read whenever the app comes to the front - the only moment it can
 * have changed, since it is only changed on Android's own settings screen.
 */
export function useExactAlarmState(): { state: ExactAlarmState; refresh: () => void } {
  const [state, setState] = useState<ExactAlarmState>(readExactAlarmState);
  const refresh = useCallback(() => setState(readExactAlarmState()), []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return { state, refresh };
}

/**
 * Opens Android's "Alarms & reminders" screen on this app's own switch.
 *
 * Returns false if it could not be opened, so the caller can tell the user where to look.
 * The package is passed so Android lands on FOYG's switch rather than a list of every app;
 * if that is refused (a build whose id differs from app.json), the plain screen is tried.
 */
export async function openExactAlarmSettings(): Promise<boolean> {
  if (!EXACT_ALARMS_ARE_A_THING) return false;
  // Imported here rather than at module scope so the module stays safe to load on web,
  // where the native side of expo-intent-launcher does not exist.
  const IntentLauncher = await import("expo-intent-launcher");
  const action = IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM;
  const packageName = Constants.expoConfig?.android?.package;
  if (packageName) {
    try {
      await IntentLauncher.startActivityAsync(action, { data: `package:${packageName}` });
      return true;
    } catch {
      // Fall through to the screen without a package.
    }
  }
  try {
    await IntentLauncher.startActivityAsync(action);
    return true;
  } catch {
    return false;
  }
}
