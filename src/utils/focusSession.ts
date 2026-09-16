import type { FocusSessionDto } from "../api/types";

/**
 * Reading a session that's already running — for Home's "Right now" card, and for picking one
 * back up after leaving the session screen.
 *
 * Everything is derived from startedAt against the device clock rather than from a counter, for
 * the same reason the session screen's own timer is: JS stops while the app is backgrounded, so
 * anything that counts ticks under-reports every minute the phone spent asleep. The server
 * credits wall-clock time too (capped at the planned length plus grace), so this agrees with what
 * the session will actually be worth.
 */

/** A Pomodoro block's default length, used where a resumed session can't say what was chosen. */
export const DEFAULT_POMODORO_MINUTES = 25;

export interface RunningSession {
  /** Whole minutes still to run; 0 once the planned time is up. Null when the length is unknown. */
  minutesLeft: number | null;
  /** Whole minutes since it started — what a session with no planned length can still honestly show. */
  minutesElapsed: number;
  /** How much of the planned length is left, 0–1, for the countdown ring. Null when unknown. */
  fractionLeft: number | null;
  plannedMinutes: number | null;
}

export function readRunningSession(session: FocusSessionDto, now: number = Date.now()): RunningSession {
  const startedAt = Date.parse(session.startedAt);
  const elapsedMs = Math.max(0, now - startedAt);
  const minutesElapsed = Math.floor(elapsedMs / 60_000);
  const planned = session.plannedMinutes;

  if (planned == null || planned <= 0) {
    return { minutesLeft: null, minutesElapsed, fractionLeft: null, plannedMinutes: null };
  }

  const plannedMs = planned * 60_000;
  const leftMs = Math.max(0, plannedMs - elapsedMs);
  return {
    // Rounded up, so a session with 30 seconds to go reads "1 min left" rather than "0".
    minutesLeft: Math.ceil(leftMs / 60_000),
    minutesElapsed,
    fractionLeft: leftMs / plannedMs,
    plannedMinutes: planned,
  };
}

/**
 * Route params for reopening a session that's already running.
 *
 * A regular session resumes exactly: its planned length and its start are both on record, so the
 * screen anchors the countdown to when it actually began instead of restarting it — leaving the
 * screen and coming back used to hand the user a fresh full-length timer.
 *
 * A Pomodoro can't be resumed that precisely. The server stores the whole sitting's length, not
 * how it was split into cycles, and a break never auto-starts the next one, so where the user was
 * in the sequence isn't recoverable. It reopens at the start of a block, which is what it did
 * before — and the honest option, since the alternative is inventing a position.
 */
export function resumeSessionParams(
  session: FocusSessionDto,
  fallbackFocusMinutes: number,
  dndEnabled: boolean
): {
  sessionId: string;
  taskId: string;
  focusMode: "regular" | "pomodoro";
  totalCycles: number;
  sessionMinutes: number;
  dndEnabled: boolean;
  startedAt?: string;
} {
  const pomodoro = session.focusMode === "pomodoro";
  return {
    sessionId: session.id,
    taskId: session.taskId,
    focusMode: session.focusMode,
    // numPomodoroCycles is only written when a session completes, so it's still null on one in
    // progress; the planned total divided by a standard block is the closest thing on record.
    totalCycles: pomodoro
      ? session.numPomodoroCycles ??
        (session.plannedMinutes ? Math.max(1, Math.round(session.plannedMinutes / DEFAULT_POMODORO_MINUTES)) : 4)
      : 1,
    sessionMinutes: pomodoro
      ? DEFAULT_POMODORO_MINUTES
      : session.plannedMinutes ?? fallbackFocusMinutes,
    dndEnabled,
    ...(pomodoro ? {} : { startedAt: session.startedAt }),
  };
}
