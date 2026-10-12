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
 * A Pomodoro now records its split at the start (`numPomodoroCycles`), so the block length is
 * simply the planned total divided by the rounds. Before that it divided by an assumed 25, and a
 * 15-15 reopened as a single 25-minute round: the user lost both their block length and their
 * second round on a refresh.
 *
 * Only a session started by an older build still has no count, and that one keeps the old
 * fallback rather than refusing to open.
 *
 * Where the user was in the sequence is a separate problem and is not solvable from this data:
 * a break waits at zero until it is tapped, so the sitting has no fixed length in real time and
 * the position can't be derived from the clock. `sessionPosition.ts` records it on the device as
 * it happens; this function supplies the shape of the sitting, not the place in it.
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
  if (!pomodoro) {
    return {
      sessionId: session.id,
      taskId: session.taskId,
      focusMode: session.focusMode,
      totalCycles: 1,
      sessionMinutes: session.plannedMinutes ?? fallbackFocusMinutes,
      dndEnabled,
      startedAt: session.startedAt,
    };
  }

  const planned = session.plannedMinutes ?? null;
  // Recorded at the start since 2026-10-13. Older rows fall back to the assumption that used to
  // be made for every session, which is wrong for any block that isn't 25 but is all they have.
  const cycles =
    session.numPomodoroCycles ??
    (planned ? Math.max(1, Math.round(planned / DEFAULT_POMODORO_MINUTES)) : 4);

  return {
    sessionId: session.id,
    taskId: session.taskId,
    focusMode: session.focusMode,
    totalCycles: cycles,
    // The whole sitting divided by its rounds. Rounded because the two were multiplied to get
    // here, so this only ever has to undo that; a stored total that doesn't divide cleanly came
    // from an older build and a whole number of minutes is still the right shape to show.
    sessionMinutes: planned ? Math.max(1, Math.round(planned / cycles)) : DEFAULT_POMODORO_MINUTES,
    dndEnabled,
  };
}
