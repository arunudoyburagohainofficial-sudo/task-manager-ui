import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { prefetchAppData } from "../api/prefetch";
import { queryClient } from "../api/queryClient";
import type { UserDto } from "../api/types";

const STORAGE_KEY = "session-user-v1";

/**
 * The "session" is just: did this device sign in (phone or Google), and if so, remember
 * the resulting UserDto locally — returning users are resumed automatically. No token is
 * stored here; that identity lives entirely in whichever Firebase SDK's own session
 * (native for phone — see firebaseAuth.ts; Web SDK for Google — see firebaseWebAuth.ts),
 * re-verified per-request by client.ts. This UserDto is purely local display/addressing
 * state, not a credential.
 */
interface SessionContextValue {
  user: UserDto | null;
  isLoading: boolean;
  /**
   * True once it's safe to show real UI: the persisted-session check has finished, and
   * — if a session was found — that session's data prefetch has either settled or been
   * given up on after a timeout. False for any window where a user is signed in but
   * their data isn't in the cache yet — both the initial cold launch (drives the native
   * splash in App.tsx) and a fresh interactive sign-in (drives RootNavigator showing
   * LoadingScreen instead of Home) key off this the same way.
   */
  isReady: boolean;
  signIn: (user: UserDto) => void;
  updateUser: (user: UserDto) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) setUser(JSON.parse(stored));
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Covers both paths that establish a session — restoring a returning user from
  // AsyncStorage above, and a fresh signIn() call below — from one place, rather than
  // needing every sign-in method (Google/phone/test-user) to remember to prefetch itself.
  // Keyed on user?.id specifically, not `user` as a whole, so updateUser (same person,
  // e.g. after editing their profile) doesn't re-trigger it.
  //
  // isReady only flips true once prefetchAppData settles — but it's raced against a
  // 4-second timeout, not awaited outright, so a dead network holds the splash screen up
  // for at most 4 seconds, not indefinitely; the app still opens and individual screens
  // show their own error/empty states rather than the user being stuck looking at a splash.
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setIsReady(true);
      return;
    }
    // Reset before racing the new prefetch — without this, an interactive sign-in (the
    // user already had isReady=true from sitting on AuthScreen) would never flip false
    // again, so nothing downstream knows to show a loading state instead of Home
    // rendering immediately with whatever's still empty in the cache. On the cold-launch
    // path this is a harmless no-op: isReady already starts false.
    setIsReady(false);
    let cancelled = false;
    Promise.race([prefetchAppData(), new Promise<void>((resolve) => setTimeout(resolve, 4000))]).then(() => {
      if (!cancelled) setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user?.id]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      isLoading,
      isReady,
      signIn: (nextUser) => {
        setUser(nextUser);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
      },
      updateUser: (nextUser) => {
        setUser(nextUser);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
      },
      signOut: () => {
        setUser(null);
        AsyncStorage.removeItem(STORAGE_KEY);
        // None of the query cache is keyed by user id (see queryKeys.ts) — without this,
        // whoever signs in next on this device would see this account's tasks/goals/
        // reminders/streak flash on screen until each query's own refetch overwrites it,
        // and anything prefetchAppData doesn't explicitly cover would keep showing this
        // account's data indefinitely. Clearing also wipes the AsyncStorage-persisted copy
        // (see queryClient.ts's persister), so a cold relaunch can't resurrect it either.
        queryClient.clear();
        // Locally scheduled reminders outlive the session otherwise — the next person to
        // sign in on this device would get the previous user's notifications.
        import("../notifications/localNotifications")
          .then((m) => m.cancelAll())
          .catch(() => {});
        // Dynamic + best-effort, same reasoning as client.ts's getCurrentFirebaseIdToken:
        // firebaseAuth.ts touches a native module that doesn't exist in plain Expo Go, and
        // this device may only have been signed in via one of the two SDKs anyway
        // (nothing to sign out of on the other).
        import("../api/firebaseAuth")
          .then((m) => m.firebaseSignOut())
          .catch(() => {});
        import("../api/firebaseWebAuth")
          .then((m) => m.webSignOutFn())
          .catch(() => {});
      },
    }),
    [user, isLoading, isReady]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
