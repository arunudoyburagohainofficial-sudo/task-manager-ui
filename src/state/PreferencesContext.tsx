import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "preferences-v1";

interface Preferences {
  /**
   * Stored locally and used to size Regular-mode focus sessions client-side — task-svc
   * has no field for a "planned" session length at all (FocusSession only ever records
   * actual elapsed time), so this is purely a client preference, never sent to the API.
   */
  defaultFocusDurationMinutes: number;
  /**
   * Stored but not yet wired to anything functional — real push notifications need an
   * Expo dev client (see memory/project_design_handoff.md), deferred in this pass.
   */
  notificationsEnabled: boolean;
  /**
   * Opt-in "silence my phone during focus sessions" preference. Genuinely silencing other
   * apps' notifications needs Android's Notification Policy Access API (a native module
   * Expo Go can't load — this app has intentionally stayed on Expo Go, see
   * memory/project_design_handoff.md) and, on iOS, Apple's Screen Time/Family Controls
   * entitlement (meant for parental-control apps, needs special App Review approval).
   * Stored as a plain client preference for now, same as notificationsEnabled above —
   * the full UI/UX is built ahead of that native capability, not wired to a real OS call yet.
   */
  dndDuringFocusEnabled: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  defaultFocusDurationMinutes: 25,
  notificationsEnabled: true,
  dndDuringFocusEnabled: false,
};

interface PreferencesContextValue extends Preferences {
  setDefaultFocusDurationMinutes: (minutes: number) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDndDuringFocusEnabled: (enabled: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setPrefs({ ...DEFAULT_PREFERENCES, ...JSON.parse(stored) });
    });
  }, []);

  const persist = (next: Preferences) => {
    setPrefs(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...prefs,
      setDefaultFocusDurationMinutes: (defaultFocusDurationMinutes) => persist({ ...prefs, defaultFocusDurationMinutes }),
      setNotificationsEnabled: (notificationsEnabled) => persist({ ...prefs, notificationsEnabled }),
      setDndDuringFocusEnabled: (dndDuringFocusEnabled) => persist({ ...prefs, dndDuringFocusEnabled }),
    }),
    [prefs]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within a PreferencesProvider");
  return ctx;
}
