import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { deliveryBlockFrom, type DeliveryBlock, type PermissionState } from "./deliveryStatus";
import { readNotificationsEnabled } from "./preference";

/**
 * The device half of `deliveryStatus` — everything that has to ask the OS.
 *
 * Kept apart from the decision so the decision stays testable off-device. Nothing here decides
 * anything; it reads two values and hands them to `deliveryBlockFrom`.
 */

/**
 * Whether this platform can queue a local notification at all.
 *
 * On web expo-notifications resolves its scheduler to a stub with neither
 * scheduleNotificationAsync nor getAllScheduledNotificationsAsync, so every scheduling call
 * throws and the queue is permanently empty — regardless of what the user has set up.
 */
export const SCHEDULING_SUPPORTED = Platform.OS !== "web";

/**
 * Why the phone won't deliver, read live.
 *
 * Deliberately never prompts: this is asked by screens that are only reporting state, and a
 * permission dialog appearing because someone opened a list would be both startling and a waste
 * of Android's single prompt. Asking is `requestPermission`'s job, behind a button the user
 * actually pressed.
 */
export async function readDeliveryBlock(): Promise<DeliveryBlock | null> {
  if (!SCHEDULING_SUPPORTED) return "unsupported";
  const switchOn = await readNotificationsEnabled();
  let permission: PermissionState;
  try {
    const existing = await Notifications.getPermissionsAsync();
    permission = { granted: existing.granted, canAskAgain: existing.canAskAgain };
  } catch {
    // A device that won't answer is treated as blocked rather than fine — claiming delivery
    // works when we couldn't check is the failure mode this whole module exists to remove.
    permission = { granted: false, canAskAgain: false };
  }
  return deliveryBlockFrom(true, switchOn, permission);
}
