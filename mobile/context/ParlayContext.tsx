import React, { createContext, useContext, useState } from "react";
import { americanToDecimal, decimalToAmerican } from "@/lib/odds-utils";

export interface ParlayLegDraft {
  selectionId: string;
  selectionName: string;
  eventLabel: string;
  marketType: string;
  consensusOdds: number;
  requestedOdds: number;
}

interface ParlayState {
  legs: ParlayLegDraft[];
  addLeg: (leg: ParlayLegDraft) => void;
  removeLeg: (selectionId: string) => void;
  updateOdds: (selectionId: string, odds: number) => void;
  hasLeg: (selectionId: string) => boolean;
  clear: () => void;
  combinedOdds: number;
}

const ParlayContext = createContext<ParlayState | null>(null);

export function ParlayProvider({ children }: { children: React.ReactNode }) {
  const [legs, setLegs] = useState<ParlayLegDraft[]>([]);

  const addLeg = (leg: ParlayLegDraft) => {
    setLegs((prev) => {
      if (prev.some((l) => l.selectionId === leg.selectionId)) return prev;
      return [...prev, leg];
    });
  };

  const removeLeg = (selectionId: string) => {
    setLegs((prev) => prev.filter((l) => l.selectionId !== selectionId));
  };

  const updateOdds = (selectionId: string, odds: number) => {
    setLegs((prev) =>
      prev.map((l) =>
        l.selectionId === selectionId ? { ...l, requestedOdds: odds } : l
      )
    );
  };

  const hasLeg = (selectionId: string) =>
    legs.some((l) => l.selectionId === selectionId);

  const clear = () => setLegs([]);

  const combinedOdds =
    legs.length < 2
      ? 0
      : decimalToAmerican(
          legs.reduce((acc, l) => acc * americanToDecimal(l.requestedOdds), 1)
        );

  return (
    <ParlayContext.Provider
      value={{ legs, addLeg, removeLeg, updateOdds, hasLeg, clear, combinedOdds }}
    >
      {children}
    </ParlayContext.Provider>
  );
}

export function useParlay(): ParlayState {
  const ctx = useContext(ParlayContext);
  if (!ctx) throw new Error("useParlay must be used inside <ParlayProvider>");
  return ctx;
}
