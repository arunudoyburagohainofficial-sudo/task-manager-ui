import { goalsApi, remindersApi, streaksApi, tasksApi, weeklyProgressApi } from ".";
import { queryClient } from "./queryClient";
import { queryKeys } from "./queryKeys";

/**
 * Fired the instant a session becomes known (see SessionContext) — starts every screen's
 * first-load data fetching immediately, before any of those screens ever mount, so the
 * network round trips overlap with whatever's already happening (splash screen, sign-in
 * transition) instead of only starting once the user has already navigated somewhere and
 * is staring at a blank screen.
 *
 * Not awaited on purpose — this is a head start, not a blocking dependency. Each call
 * uses the exact same query key its screen's own hook reads from, so by the time that
 * screen actually mounts, TanStack Query either already has the answer cached or is
 * already mid-flight on the identical request and the screen's own useQuery call joins
 * that same promise — never a second, redundant call for the same data.
 *
 * staleTime: 0 on every call here, overriding the client's global Infinity default — this
 * is the one place in the app that's allowed to distrust the cache. Without it,
 * prefetchQuery would see any already-cached (or disk-restored) value as "fresh forever"
 * and skip the network call entirely — meaning every app launch after the very first ever
 * would silently reuse whatever was cached, with nothing to catch it going stale. This is
 * what makes every fresh app open still a guaranteed real check, while in-session
 * navigation (Home ↔ Task Detail, etc.) still gets the no-redundant-calls behavior the
 * global Infinity default is actually for.
 *
 * Returns a promise resolving once every prefetch has settled — used by SessionContext to
 * know when it's safe to hide the splash screen (see isReady there). Promise.allSettled,
 * not Promise.all: one endpoint failing (offline, a 500) shouldn't hold up the other eight
 * or throw here — the caller just wants to know "everything that COULD load, has."
 *
 * Deliberately does NOT include interval reminders — nothing in the UI renders them today
 * (only the background notification sync reads them), so prefetching them would just be
 * network cost with no screen ever benefiting from it.
 */
export function prefetchAppData(): Promise<void> {
  return Promise.allSettled([
    queryClient.prefetchQuery({ queryKey: queryKeys.tasks("pending"), queryFn: () => tasksApi.getTasks("pending"), staleTime: 0 }),
    queryClient.prefetchQuery({ queryKey: queryKeys.tasks("completed"), queryFn: () => tasksApi.getTasks("completed"), staleTime: 0 }),
    // Needed by the goal picker during capture, and by the Goals strip on both Home and Progress.
    queryClient.prefetchQuery({ queryKey: queryKeys.goals(), queryFn: () => goalsApi.getGoals(), staleTime: 0 }),
    queryClient.prefetchQuery({ queryKey: queryKeys.reminders(), queryFn: () => remindersApi.getReminders(), staleTime: 0 }),
    queryClient.prefetchQuery({ queryKey: queryKeys.streak(), queryFn: () => streaksApi.getStreak(), staleTime: 0 }),
    queryClient.prefetchQuery({ queryKey: queryKeys.weeklyProgressCurrent(), queryFn: () => weeklyProgressApi.getCurrentWeekProgress(), staleTime: 0 }),
    queryClient.prefetchQuery({ queryKey: queryKeys.weeklyProgressHistory(4), queryFn: () => weeklyProgressApi.getHistory(4), staleTime: 0 }),
    queryClient.prefetchQuery({ queryKey: queryKeys.weeklyProgressAllTime(), queryFn: () => weeklyProgressApi.getAllTimeStats(), staleTime: 0 }),
  ]).then(() => undefined);
}
