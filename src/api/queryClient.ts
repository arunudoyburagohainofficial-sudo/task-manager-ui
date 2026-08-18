import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
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
export const queryClient = new QueryClient({
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
