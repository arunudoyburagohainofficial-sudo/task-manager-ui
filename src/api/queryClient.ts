import AsyncStorage from "@react-native-async-storage/async-storage";
import { focusManager, MutationCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { queryKeys } from "./queryKeys";
import { AppState } from "react-native";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Single shared cache for every screen. staleTime: Infinity means TanStack never
 * refetches purely because time passed — every mutation is responsible for patching the
 * cache itself with what it knows changed (see src/api/queries/), the same way a Redux/
 * NgRx reducer is responsible for representing an action's effect on the store. Nothing
 * here refetches implicitly in the background; every network call is either the initial
 * prefetch, a mutation, or an explicit pull-to-refresh.
 *
 * The real tradeoff, deliberately accepted: this app no longer automatically notices
 * "another of the user's own devices changed something" — that only gets picked up on
 * the next full app launch (fresh prefetch) or a manual refresh, not silently in the
 * background. Reminders are the one exception — useReminderSync's own AppState listener
 * refreshes them independently of this setting, regardless of staleness.
 *
 * gcTime governs something different from staleTime: how long an unused query is kept
 * around (in memory, and — see persister below — on disk) before being dropped entirely.
 * Bumped to 24h from the 5-minute library default specifically because of persistence: if
 * a query gets garbage-collected while the app is merely backgrounded for a while, the
 * next disk save would persist its absence, and a cold launch after that would show
 * nothing for it instead of yesterday's real data.
 */
/**
 * "The app is in front again" is what React Query calls focus — wired to AppState, since a phone
 * has no window focus event of its own (TanStack's documented React Native setup).
 *
 * Narrow in effect on purpose: everything here is `staleTime: Infinity`, so a return to the app
 * re-checks only what is marked always-stale — today, just the task open on Task Detail. Without
 * this, a task deleted or rescheduled on another device stayed on screen, editable, however long
 * the app had been away.
 */
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener("change", (state) => handleFocus(state === "active"));
  return () => subscription.remove();
});

/** The task a mutation was about, whichever shape its variables take. */
function taskIdOf(variables: unknown): string | null {
  if (typeof variables === "string") return variables;
  if (variables && typeof variables === "object" && "taskId" in variables) {
    const id = (variables as { taskId: unknown }).taskId;
    return typeof id === "string" ? id : null;
  }
  return null;
}

export const queryClient = new QueryClient({
  /*
   * Any action on a task that the server says doesn't exist re-checks that task. It was deleted —
   * here, or on another device — and without this the screen kept showing it, editable, with
   * every action failing behind a generic "Couldn't…". The re-check 404s too, which is what turns
   * Task Detail into "This task is gone", and the lists drop it on their refetch.
   */
  mutationCache: new MutationCache({
    onError: (error, variables) => {
      const taskId = taskIdOf(variables);
      if (!taskId || !(error instanceof ApiError) || error.status !== 404) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks() });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: ONE_DAY_MS,
      retry: 1,
    },
  },
});

/**
 * Mirrors the cache to AsyncStorage (see App.tsx's PersistQueryClientProvider) so a cold
 * app launch can paint real, if possibly stale, data immediately from disk instead of
 * waiting on a network round trip — the actual fix for "instant even on a fresh launch."
 * The live prefetch in prefetch.ts still runs the same as before; this only changes what
 * the very first render has available before that prefetch (or its 4s timeout) resolves.
 * maxAge matches gcTime above, per TanStack's own persistence guidance — data isn't
 * restored from disk past the point it would've been evicted from memory anyway.
 */
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "task-app-query-cache-v1",
  throttleTime: 1_000,
});

export const persistOptions = {
  persister: asyncStoragePersister,
  maxAge: ONE_DAY_MS,
};
