import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "focus-session-paused-v1";

/**
 * Whether the session on this device is paused.
 *
 * Pausing never reaches the server — there is no endpoint for it, and the countdown is handled
 * on the phone by pushing the deadline out. So the server only ever knows when a session
 * *started*, and wall-clock time keeps accruing through a pause.
 *
 * That matters for the auto-finish rule, which closes sessions that have run past the point of
 * earning anything. Without this, pausing a 25-minute session to go to lunch and coming back an
 * hour later would find it closed — the one case where the user was most deliberate about
 * wanting it kept.
 *
 * Stored by session id rather than as a bare flag, so a stale mark from an earlier session can
 * never suppress the cleanup of a later one.
 */
export async function setSessionPaused(sessionId: string, paused: boolean): Promise<void> {
  try {
    if (paused) await AsyncStorage.setItem(STORAGE_KEY, sessionId);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // A lost mark only means the session may be closed a little early. Never worth throwing.
  }
}

export async function isSessionPaused(sessionId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === sessionId;
  } catch {
    return false;
  }
}
