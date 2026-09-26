import {
  getActiveShield,
  getPermissions,
  isShieldSupported,
  startShield,
  stopShield,
  type ShieldPermissions,
} from "../../modules/focus-shield";

/**
 * The app's side of the shield: when it goes up, when it comes down, and what to tell someone
 * who's turned it on but not granted what it needs.
 *
 * The native module already refuses to outlive its deadline on its own (an AlarmManager alarm,
 * a boot receiver, and expiry applied on every read of the stored shield). Nothing here is
 * load-bearing for *lifting* the shield — that's deliberate. This layer decides when to raise
 * it and makes the common case tidy; if every line of it failed, the shield would still come
 * down on time.
 */

export type ShieldCapability = "off" | "notificationsOnly" | "notificationsAndApps";

/**
 * What a session would actually do, given what the user asked for and what they've granted.
 *
 * Kept as one function so the session screen and the settings screen can't disagree about it —
 * the badge shown during a session and the explanation shown in Settings are the same answer.
 * Showing "Do Not Disturb" over a session that is silencing nothing is the exact dishonesty the
 * old "preview" pill had, and it's worth never doing again.
 */
export function shieldCapability(
  wantsDnd: boolean,
  blockedAppIds: string[],
  permissions: ShieldPermissions
): ShieldCapability {
  if (!isShieldSupported || !wantsDnd) return "off";
  const canBlockApps =
    blockedAppIds.length > 0 && permissions.usageStats && permissions.overlay;
  if (canBlockApps) return "notificationsAndApps";
  if (permissions.notificationPolicy) return "notificationsOnly";
  return "off";
}

/** Everything still missing before the user gets what they asked for. */
export function missingPermissions(
  wantsDnd: boolean,
  blockedAppIds: string[],
  permissions: ShieldPermissions
): Array<keyof ShieldPermissions> {
  if (!isShieldSupported || !wantsDnd) return [];
  const missing: Array<keyof ShieldPermissions> = [];
  if (!permissions.notificationPolicy) missing.push("notificationPolicy");
  if (blockedAppIds.length > 0) {
    if (!permissions.usageStats) missing.push("usageStats");
    if (!permissions.overlay) missing.push("overlay");
  }
  return missing;
}

/**
 * Raises the shield for a session ending at `endsAt`.
 *
 * Never throws. A shield that fails to start must not stop a focus session from running — the
 * session is the thing the user asked for, the shield is an assist. It's also why the deadline
 * is passed as an absolute instant rather than a length: the native side hands it straight to
 * AlarmManager, and a duration would restart every time the process did.
 */
export async function raiseShield(opts: {
  endsAt: Date;
  wantsDnd: boolean;
  blockedAppIds: string[];
}): Promise<void> {
  if (!isShieldSupported || !opts.wantsDnd) return;
  const permissions = getPermissions();
  try {
    await startShield({
      until: opts.endsAt.getTime(),
      // Only the ones that can actually be enforced. Passing app ids without usage access
      // would start the watching service knowing it can see nothing.
      blockedAppIds:
        permissions.usageStats && permissions.overlay ? opts.blockedAppIds : [],
      silenceNotifications: permissions.notificationPolicy,
    });
  } catch {
    // Swallowed on purpose — see above. The session continues unshielded.
  }
}

/**
 * Lowers the shield. Safe to call when none is up, and called from every path that ends a
 * session: finished, ended early, discarded, and on mounting the session screen for a session
 * that turns out to be already over.
 */
export async function lowerShield(): Promise<void> {
  if (!isShieldSupported) return;
  try {
    await stopShield();
  } catch {
    // The deadline still lifts it. Nothing here is the last line of defence.
  }
}

/**
 * Clears a shield left behind by a session that is no longer running.
 *
 * The case this exists for: the app is killed mid-session, the alarm hasn't fired yet, and the
 * user reopens the app and starts something else — or nothing. The device is still shielded for
 * a session that, as far as the app is concerned, ended. Called on launch and on foreground.
 */
export async function reconcileShield(hasRunningSession: boolean): Promise<void> {
  if (!isShieldSupported) return;
  if (hasRunningSession) return;
  if (getActiveShield() == null) return;
  await lowerShield();
}

export { getPermissions, isShieldSupported, type ShieldPermissions };
