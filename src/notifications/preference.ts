import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Settings → Reminder notifications, read where the queue is built.
 *
 * Read from storage on every sync rather than passed down from React, because the scheduler runs
 * outside the component tree (useReminderSync fires it from foreground events and mutations).
 * Same key and shape PreferencesContext writes. Defaults to on — a missing or unreadable value
 * must never silently turn someone's reminders off.
 */
export async function readNotificationsEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem("preferences-v1");
    if (!stored) return true;
    return JSON.parse(stored).notificationsEnabled !== false;
  } catch {
    return true;
  }
}
