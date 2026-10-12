import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "focus-session-position-v1";

/** Where a Pomodoro sitting had got to, as last seen by the session screen. */
export interface SessionPosition {
  sessionId: string;
  /** 1-based, counting work blocks. */
  cycle: number;
  phase: "working" | "break";
  /** When the current block ends, as an epoch millisecond value, or null while paused. */
  deadline: number | null;
  /** Milliseconds still to run when it was paused; null while running. */
  pausedWithMsLeft: number | null;
}

/**
 * Where the user is inside a running session, kept on this device.
 *
 * The server knows when a sitting started, how long it is meant to be, and how it is split. That
 * is enough to describe the *shape* of a Pomodoro but not the *place* in it, because a break
 * waits at zero until it is tapped. A sitting of 2 x 15 therefore has no fixed length in real
 * time: it occupies 35 minutes if the break is taken promptly and three hours if it is not. So
 * no amount of arithmetic on `startedAt` can say whether the user is in round two's work or
 * eight minutes into a break.
 *
 * Writing it down as it happens is the only honest answer. It lives here rather than on the
 * server for the same reason the pause mark does: there is no endpoint for it, the position is a
 * property of the screen rather than of the credited work, and losing it costs nothing worse
 * than reopening at the start of a block, which is exactly what used to happen every time.
 *
 * Keyed by session id so a mark left by an earlier session can never be read into a later one.
 */
export async function setSessionPosition(position: SessionPosition): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // A lost position only means reopening at the start of a block. Never worth throwing.
  }
}

export async function getSessionPosition(sessionId: string): Promise<SessionPosition | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionPosition>;
    if (parsed.sessionId !== sessionId) return null;
    if (typeof parsed.cycle !== "number" || parsed.cycle < 1) return null;
    if (parsed.phase !== "working" && parsed.phase !== "break") return null;
    return {
      sessionId,
      cycle: parsed.cycle,
      phase: parsed.phase,
      deadline: typeof parsed.deadline === "number" ? parsed.deadline : null,
      pausedWithMsLeft: typeof parsed.pausedWithMsLeft === "number" ? parsed.pausedWithMsLeft : null,
    };
  } catch {
    return null;
  }
}

export async function forgetSessionPosition(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above: a stale mark is checked against the session id before it is ever used.
  }
}
