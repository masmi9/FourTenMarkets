"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface ParlayLegDraft {
  selectionId: string;
  selectionName: string;  // e.g. "Celtics -5.5"
  eventLabel: string;     // e.g. "BOS @ LAL"
  marketType: string;     // "Moneyline" | "Spread" | "Total"
  consensusOdds: number;
  requestedOdds: number;  // user-editable
}

interface ParlayContextValue {
  legs: ParlayLegDraft[];
  addLeg: (leg: ParlayLegDraft) => void;
  removeLeg: (selectionId: string) => void;
  updateOdds: (selectionId: string, odds: number) => void;
  hasLeg: (selectionId: string) => boolean;
  clear: () => void;
}

const ParlayContext = createContext<ParlayContextValue | null>(null);

export function ParlayProvider({ children }: { children: ReactNode }) {
  const [legs, setLegs] = useState<ParlayLegDraft[]>([]);

  const addLeg = useCallback((leg: ParlayLegDraft) => {
    setLegs((prev) => {
      if (prev.some((l) => l.selectionId === leg.selectionId)) return prev;
      return [...prev, leg];
    });
  }, []);

  const removeLeg = useCallback((selectionId: string) => {
    setLegs((prev) => prev.filter((l) => l.selectionId !== selectionId));
  }, []);

  const updateOdds = useCallback((selectionId: string, odds: number) => {
    setLegs((prev) =>
      prev.map((l) => (l.selectionId === selectionId ? { ...l, requestedOdds: odds } : l))
    );
  }, []);

  const hasLeg = useCallback(
    (selectionId: string) => legs.some((l) => l.selectionId === selectionId),
    [legs]
  );

  const clear = useCallback(() => setLegs([]), []);

  return (
    <ParlayContext.Provider value={{ legs, addLeg, removeLeg, updateOdds, hasLeg, clear }}>
      {children}
    </ParlayContext.Provider>
  );
}

export function useParlay() {
  const ctx = useContext(ParlayContext);
  if (!ctx) throw new Error("useParlay must be used within ParlayProvider");
  return ctx;
}
