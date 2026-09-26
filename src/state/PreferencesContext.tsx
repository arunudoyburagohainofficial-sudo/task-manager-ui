import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "preferences-v1";

interface Preferences {
  /**
   * Stored locally and used to size Regular-mode focus sessions client-side — task-svc
   * has no field for a "planned" session length at all (FocusSession only ever records
   * actual elapsed time), so this is purely a client preference, never sent to the API.
   */
  defaultFocusDurationMinutes: number;
  /**
   * Settings → Reminder notifications. Read by the scheduler on every sync
   * (notifications/preference.ts): off means nothing is queued, and whatever was is cleared.
   */
  notificationsEnabled: boolean;
  /**
   * "Silence my phone during focus sessions" — real on Android as of the Focus Shield module
   * (modules/focus-shield), which puts the device into system Do Not Disturb for the length of
   * a session and restores the user's own setting afterwards.
   *
   * Still inert on iOS and in Expo Go, where the native module isn't present: `isShieldSupported`
   * is false and the shield calls no-op. The preference is kept rather than hidden so the choice
   * survives moving between an Expo Go build and a real one.
   */
  dndDuringFocusEnabled: boolean;
  /**
   * Android package names to block for the length of a session. Empty means notifications-only.
   *
   * A device setting, not account data, and deliberately not synced through task-svc: package
   * names are specific to what's installed on *this* phone, so the same list on another device
   * would be partly meaningless. (On iOS the equivalent is impossible in principle — Apple's
   * picker returns opaque tokens that can't be stored server-side at all. See
   * MD/focus-shield-spec.md.)
   */
  blockedAppIds: string[];
}

const DEFAULT_PREFERENCES: Preferences = {
  defaultFocusDurationMinutes: 25,
  notificationsEnabled: true,
  dndDuringFocusEnabled: false,
  blockedAppIds: [],
};

interface PreferencesContextValue extends Preferences {
  setDefaultFocusDurationMinutes: (minutes: number) => void;
  /** Resolves once the preference is on disk, so a sync started after it reads the new value. */
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  setDndDuringFocusEnabled: (enabled: boolean) => void;
  setBlockedAppIds: (ids: string[]) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setPrefs({ ...DEFAULT_PREFERENCES, ...JSON.parse(stored) });
    });
  }, []);

  /*
   * Changes merge into the *latest* preferences, not the render's copy. Every setter used to
   * spread the same captured `prefs`, so saving two changes at once — Settings saves them one
   * after another — kept only the last: turning reminders off and changing the focus length in
   * one save wrote the new length and silently switched reminders back on.
   */
  const latest = useRef(prefs);
  latest.current = prefs;
  const persist = (patch: Partial<Preferences>): Promise<void> => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setPrefs(next);
    return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...prefs,
      setDefaultFocusDurationMinutes: (defaultFocusDurationMinutes) => void persist({ defaultFocusDurationMinutes }),
      setNotificationsEnabled: (notificationsEnabled) => persist({ notificationsEnabled }),
      setDndDuringFocusEnabled: (dndDuringFocusEnabled) => void persist({ dndDuringFocusEnabled }),
      setBlockedAppIds: (blockedAppIds) => void persist({ blockedAppIds }),
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
