import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "companion-settings-v1";

export type CompanionTone = "gentle" | "hype" | "deadpan";

export const COMPANION_NAME_SUGGESTIONS = ["Fern", "Momo", "Pip"] as const;

interface CompanionSettings {
  name: string;
  tone: CompanionTone;
}

/**
 * design_handoff_focus_capture_app 2/COMPANION.md calls for {companionName, tone}
 * persisted server-side alongside user preferences (needs two new user fields — flagged
 * to backend, not present in task-svc yet). Stored client-only for now, same pattern as
 * PreferencesContext/AppearanceContext.
 */
const DEFAULT_SETTINGS: CompanionSettings = {
  name: "Fern",
  tone: "gentle",
};

interface CompanionContextValue extends CompanionSettings {
  setName: (name: string) => void;
  setTone: (tone: CompanionTone) => void;
}

const CompanionContext = createContext<CompanionContextValue | undefined>(undefined);

export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CompanionSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
    });
  }, []);

  const persist = (next: CompanionSettings) => {
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const value = useMemo<CompanionContextValue>(
    () => ({
      ...settings,
      setName: (name) => persist({ ...settings, name: name.trim() || DEFAULT_SETTINGS.name }),
      setTone: (tone) => persist({ ...settings, tone }),
    }),
    [settings]
  );

  return <CompanionContext.Provider value={value}>{children}</CompanionContext.Provider>;
}

export function useCompanion(): CompanionContextValue {
  const ctx = useContext(CompanionContext);
  if (!ctx) throw new Error("useCompanion must be used within a CompanionProvider");
  return ctx;
}
