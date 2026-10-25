import { useCallback, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "focus-session-position-v1";

/** Where a Pomodoro sitting had got to, as last set by the session screen. */
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
 * The one place a running session's position lives, subscribed to rather than copied.
 *
 * The server knows when a sitting started, how long it is meant to be, and how it is split.
 * That describes the *shape* of a Pomodoro but not the *place* in it, because a break waits at
 * zero until it is tapped: a 2 x 15 occupies 35 minutes if the break is taken promptly and three
 * hours if it is not. No arithmetic on `startedAt` can say whether someone is in round two's
 * work or eight minutes into a break, so the position has to be written down as it happens.
 *
 * It began as storage alone, and that was the bug. Two screens each read it once and then kept
 * their own copy, so pausing on the session screen left Home counting down a deadline that had
 * already been suspended - 24:40 on one screen against 24:25 and falling on the other. Patching
 * that by re-reading on focus only narrowed the window; the screens were still each holding a
 * guess.
 *
 * So the value lives here, in memory, and both screens read *this*. A write updates it and tells
 * every subscriber in the same tick, which is why the two clocks can no longer disagree: there
 * is only one clock. AsyncStorage is demoted to what it should always have been - durability
 * across an app restart, not the channel between two screens.
 *
 * The session screen is the only writer. Home reads.
 */
let current: SessionPosition | null = null;
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The snapshot has to be reference-stable between changes or `useSyncExternalStore` re-renders
 * forever, so `current` is replaced on write rather than mutated in place.
 */
function getSnapshot(): SessionPosition | null {
  return current;
}

function parse(raw: string | null): SessionPosition | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<SessionPosition>;
    if (typeof p.sessionId !== "string") return null;
    if (typeof p.cycle !== "number" || p.cycle < 1) return null;
    if (p.phase !== "working" && p.phase !== "break") return null;
    return {
      sessionId: p.sessionId,
      cycle: p.cycle,
      phase: p.phase,
      deadline: typeof p.deadline === "number" ? p.deadline : null,
      pausedWithMsLeft: typeof p.pausedWithMsLeft === "number" ? p.pausedWithMsLeft : null,
    };
  } catch {
    return null;
  }
}

/**
 * Reads the stored position into memory, once per app run.
 *
 * Only matters after a cold start, when memory is empty but a session may still be open. Every
 * read after that is served from memory, so no screen waits on storage to draw a clock.
 */
export function hydrateSessionPosition(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydrating) {
    hydrating = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        // A write that landed while this was in flight is newer than what storage returned.
        if (!hydrated && current == null) current = parse(raw);
        hydrated = true;
        emit();
      })
      .catch(() => {
        hydrated = true;
      });
  }
  return hydrating;
}

/** True once storage has answered, so a reader can tell "no position" from "not yet known". */
export function isSessionPositionHydrated(): boolean {
  return hydrated;
}

export function setSessionPosition(position: SessionPosition): void {
  current = position;
  hydrated = true;
  emit();
  // Persistence only. Nothing reads this back within a run.
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(position)).catch(() => {
    // A lost write costs reopening at the start of a block, which is what used to happen anyway.
  });
}

export function forgetSessionPosition(): void {
  current = null;
  hydrated = true;
  emit();
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {
    // Checked against the session id on read, so a stale row can never be used anyway.
  });
}

/** The position for one session, or null. Re-renders the caller whenever it changes. */
export function useSessionPosition(sessionId: string): SessionPosition | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return snapshot?.sessionId === sessionId ? snapshot : null;
}

/** Reads once, for the screen that owns the position and restores itself from it. */
export async function readSessionPosition(sessionId: string): Promise<SessionPosition | null> {
  await hydrateSessionPosition();
  return current?.sessionId === sessionId ? current : null;
}

/** Subscribes without the session-id filter; used only by tests and diagnostics. */
export function useSessionPositionHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => hydrated, []),
    useCallback(() => hydrated, [])
  );
}
