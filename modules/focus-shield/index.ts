import { NativeModule, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/**
 * Focus Shield — silencing notifications and blocking apps for the length of a focus session.
 *
 * Android only. iOS needs Apple's Screen Time stack (FamilyControls + ManagedSettings + a
 * DeviceActivity extension) behind an entitlement this app hasn't been granted, and it can't
 * silence other apps' notifications at all — a different feature wearing the same name. See
 * MD/focus-shield-spec.md. Every export here degrades to "unavailable" off Android rather than
 * throwing, so the UI can ask what's possible instead of branching on Platform.OS everywhere.
 *
 * ── The one rule this module is built around ──
 *
 * A shield must never outlive its session. Not if the app is killed, not if it crashes, not if
 * the phone reboots, not if the service is starved by battery optimisation. Getting this wrong
 * doesn't show a wrong number on a screen — it leaves someone unable to use their phone.
 *
 * So every shield carries an absolute expiry instant, written down before anything is blocked,
 * and *nothing lifts the shield by being asked nicely*. The deadline is enforced by an
 * AlarmManager alarm the OS owns, by the service's own polling loop, and by a boot receiver.
 * When any of them is uncertain, it unblocks. Fail open, always.
 */

/** Which of the three separate permissions Android makes you collect. */
export type ShieldPermission =
  /** ACCESS_NOTIFICATION_POLICY — lets us turn system Do Not Disturb on and off. */
  | "notificationPolicy"
  /** PACKAGE_USAGE_STATS — lets us see which app is in the foreground. */
  | "usageStats"
  /** SYSTEM_ALERT_WINDOW — lets us draw the blocking screen over that app. */
  | "overlay";

export interface ShieldPermissions {
  notificationPolicy: boolean;
  usageStats: boolean;
  overlay: boolean;
}

/** A launcher-visible app the user could choose to block. */
export interface InstalledApp {
  /** Android package name — the id used in `startShield`. */
  id: string;
  /** What the launcher calls it. */
  name: string;
  /** Base64 PNG of the launcher icon, or null when it couldn't be rendered. */
  icon: string | null;
}

export interface StartShieldOptions {
  /**
   * When the shield lifts, as epoch milliseconds — absolute, never a duration.
   *
   * A duration would be counted from whenever the service happened to start, and would drift
   * or stall if the process were restarted. An instant survives being handed to AlarmManager,
   * being re-read after a reboot, and the device's clock being changed underneath it. This is
   * the same rule the rest of the app follows for anything date-shaped.
   */
  until: number;
  /** Package names to block. Empty means notifications-only. */
  blockedAppIds: string[];
  /** Whether to put the phone into system Do Not Disturb for the session. */
  silenceNotifications: boolean;
}

export interface ActiveShield {
  until: number;
  blockedAppIds: string[];
  silenceNotifications: boolean;
}

declare class FocusShieldNativeModule extends NativeModule {
  getPermissions(): ShieldPermissions;
  /** Opens the relevant Settings screen. Android grants these there, not through a prompt. */
  requestPermission(permission: ShieldPermission): Promise<void>;
  listInstalledApps(): Promise<InstalledApp[]>;
  startShield(options: StartShieldOptions): Promise<void>;
  stopShield(): Promise<void>;
  getActiveShield(): ActiveShield | null;
}

/**
 * Optional on purpose. The module is absent in Expo Go and on web, and a hard `requireNativeModule`
 * would crash the whole app at import time on both — this screen is reachable from Settings, which
 * every build has.
 */
const native = requireOptionalNativeModule<FocusShieldNativeModule>("FocusShield");

/** Whether this build can shield at all. False in Expo Go, on web, and on iOS. */
export const isShieldSupported = Platform.OS === "android" && native != null;

const NOTHING_GRANTED: ShieldPermissions = {
  notificationPolicy: false,
  usageStats: false,
  overlay: false,
};

export function getPermissions(): ShieldPermissions {
  return native?.getPermissions() ?? NOTHING_GRANTED;
}

export async function requestPermission(permission: ShieldPermission): Promise<void> {
  await native?.requestPermission(permission);
}

export async function listInstalledApps(): Promise<InstalledApp[]> {
  return (await native?.listInstalledApps()) ?? [];
}

export async function startShield(options: StartShieldOptions): Promise<void> {
  // A shield with nothing to do is not an error — a session where the user granted neither
  // permission still runs, it just doesn't shield. Starting the service anyway would put a
  // notification in the shade promising something that isn't happening.
  if (!isShieldSupported) return;
  if (!options.silenceNotifications && options.blockedAppIds.length === 0) return;
  await native?.startShield(options);
}

export async function stopShield(): Promise<void> {
  await native?.stopShield();
}

/** The shield the device is actually holding, read from native state rather than remembered. */
export function getActiveShield(): ActiveShield | null {
  return native?.getActiveShield() ?? null;
}
