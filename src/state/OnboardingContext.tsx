import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "onboarding-v1";

/**
 * Keys an older build would already have written. Any of them means this install predates
 * onboarding, so there is nothing to onboard.
 */
const PRIOR_USE_KEYS = ["tour-v1", "task-app-query-cache-v1", "preferences-v1", "appearance-v1"];

interface Stored {
  finished: boolean;
  /** Hours a day the person said they spend on their phone, from the slider on the screen-time step. */
  screenTimeHours?: number;
}

interface OnboardingValue {
  /** Null until storage has been read — the navigator waits rather than flashing the wrong branch. */
  finished: boolean | null;
  screenTimeHours: number | null;
  setScreenTimeHours: (hours: number) => void;
  finish: () => void;
  restart: () => void;
}

const OnboardingContext = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [finished, setFinished] = useState<boolean | null>(null);
  const [screenTimeHours, setHours] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.multiGet([STORAGE_KEY, ...PRIOR_USE_KEYS])
      .then((entries) => {
        if (!alive) return;
        const map = new Map(entries);
        const raw = map.get(STORAGE_KEY);

        if (!raw) {
          // No flag yet. That means a fresh install — unless the device already holds state from
          // an older build, in which case this is someone updating, and sending them through
          // onboarding would be a worse bug than never showing it.
          const usedBefore = PRIOR_USE_KEYS.some((key) => map.get(key) != null);
          setFinished(usedBefore);
          if (usedBefore) void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ finished: true })).catch(() => {});
          return;
        }

        const parsed = JSON.parse(raw) as Stored;
        setFinished(Boolean(parsed.finished));
        if (typeof parsed.screenTimeHours === "number") setHours(parsed.screenTimeHours);
      })
      // Unreadable storage counts as finished: a person who already uses the app must never be
      // sent back through onboarding because a read failed.
      .catch(() => alive && setFinished(true));
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((next: Stored) => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const value = useMemo<OnboardingValue>(
    () => ({
      finished,
      screenTimeHours,
      setScreenTimeHours: (hours) => {
        setHours(hours);
        persist({ finished: false, screenTimeHours: hours });
      },
      finish: () => {
        setFinished(true);
        persist({ finished: true, screenTimeHours: screenTimeHours ?? undefined });
      },
      restart: () => {
        setFinished(false);
        persist({ finished: false, screenTimeHours: screenTimeHours ?? undefined });
      },
    }),
    [finished, screenTimeHours, persist]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return ctx;
}
