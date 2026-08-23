import React, { createContext, useContext } from "react";

export type CompanionTone = "gentle" | "hype" | "deadpan";

interface CompanionSettings {
  name: string;
  tone: CompanionTone;
}

/**
 * The companion's fixed identity. Naming and tone used to be user-configurable from
 * Settings; that was removed as unnecessary, so both are now constants and nothing is
 * persisted.
 *
 * Kept as a context rather than a bare export so the five screens that read it keep one
 * source of truth, and so reintroducing personalization later means restoring state here
 * instead of re-plumbing every call site. companionCopy still branches on tone — those
 * variants are unreachable while this is fixed to "gentle", but they're authored copy
 * worth keeping for whenever a tone control comes back.
 */
const COMPANION: CompanionSettings = {
  name: "Fern",
  tone: "gentle",
};

const CompanionContext = createContext<CompanionSettings>(COMPANION);

export function CompanionProvider({ children }: { children: React.ReactNode }) {
  return <CompanionContext.Provider value={COMPANION}>{children}</CompanionContext.Provider>;
}

export function useCompanion(): CompanionSettings {
  return useContext(CompanionContext);
}
