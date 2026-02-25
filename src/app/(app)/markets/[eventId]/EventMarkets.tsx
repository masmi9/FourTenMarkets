"use client";

import { useState } from "react";
import { formatOdds } from "@/lib/odds-utils";
import BetSlip from "@/components/bet-slip/BetSlip";
import { useParlay } from "@/context/ParlayContext";

interface Selection {
  id: string;
  name: string;
  line?: string | null;
  consensus: {
    odds: number;
    impliedProb: number;
    lineMovement: number;
  } | null;
}

interface Market {
  id: string;
  name: string;
  type: string;
  status: string;
  selections: Selection[];
}

const MARKET_TYPE_LABEL: Record<string, string> = {
  MONEYLINE: "Moneyline",
  SPREAD: "Spread",
  TOTAL: "Total",
  PLAYER_PROP: "Player Prop",
};

export default function EventMarkets({
  eventId,
  eventLabel,
  markets,
}: {
  eventId: string;
  eventLabel: string;
  markets: Market[];
}) {
  const [activeSelection, setActiveSelection] = useState<Selection | null>(null);
  const { addLeg, hasLeg } = useParlay();

  function handleAddToParlay(market: Market, selection: Selection) {
    const marketType = MARKET_TYPE_LABEL[market.type] ?? market.type;
    const selectionName = selection.line
      ? `${selection.name} ${selection.line}`
      : selection.name;

    addLeg({
      selectionId: selection.id,
      selectionName,
      eventLabel,
      marketType,
      consensusOdds: selection.consensus?.odds ?? -110,
      requestedOdds: selection.consensus?.odds ?? -110,
    });
  }

  return (
    <>
      <div className="space-y-4">
        {markets.map((market) => (
          <div
            key={market.id}
            className="bg-brand-card rounded-xl border border-border overflow-hidden"
          >
            {/* Market header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="font-semibold">{market.name}</h3>
              <MarketTypeBadge type={market.type} />
            </div>

            {/* Selections */}
            <div className="p-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {market.selections.map((selection) => {
                const inParlay = hasLeg(selection.id);
                return (
                  <div
                    key={selection.id}
                    className={`flex items-center justify-between p-4 bg-brand-surface rounded-lg border transition-all ${
                      inParlay
                        ? "border-primary/60 bg-primary/5"
                        : "border-border"
                    } ${market.status !== "OPEN" ? "opacity-50" : ""}`}
                  >
                    {/* Left: name + line + movement */}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">
                        {selection.name}
                        {selection.line && (
                          <span className="text-muted-foreground"> {selection.line}</span>
                        )}
                      </p>
                      {selection.consensus?.lineMovement !== undefined &&
                        selection.consensus.lineMovement !== 0 && (
                          <p
                            className={`text-xs mt-0.5 ${
                              selection.consensus.lineMovement > 0
                                ? "text-brand-green"
                                : "text-brand-red"
                            }`}
                          >
                            {selection.consensus.lineMovement > 0 ? "▲" : "▼"}{" "}
                            {Math.abs(selection.consensus.lineMovement * 100).toFixed(1)}%
                          </p>
                        )}
                    </div>

                    {/* Right: odds + action buttons */}
                    <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                      <div className="text-right">
                        {selection.consensus ? (
                          <p
                            className={`text-xl font-bold ${
                              selection.consensus.odds > 0
                                ? "text-brand-green"
                                : "text-foreground"
                            }`}
                          >
                            {formatOdds(selection.consensus.odds)}
                          </p>
                        ) : (
                          <p className="text-muted-foreground text-sm">N/A</p>
                        )}
                      </div>

                      {market.status === "OPEN" && (
                        <div className="flex flex-col gap-1">
                          {/* Single bet button */}
                          <button
                            onClick={() => setActiveSelection(selection)}
                            className="px-2 py-1 text-xs bg-primary/15 text-primary rounded hover:bg-primary/25 transition-colors font-medium"
                          >
                            Bet
                          </button>
                          {/* Add to parlay button */}
                          <button
                            onClick={() => handleAddToParlay(market, selection)}
                            disabled={inParlay}
                            className={`px-2 py-1 text-xs rounded transition-colors font-medium ${
                              inParlay
                                ? "bg-primary/30 text-primary cursor-default"
                                : "bg-accent hover:bg-accent/80 text-foreground"
                            }`}
                          >
                            {inParlay ? "✓ Parlay" : "+ Parlay"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Single-bet slip drawer */}
      {activeSelection && (
        <BetSlip
          selection={activeSelection}
          onClose={() => setActiveSelection(null)}
        />
      )}
    </>
  );
}

function MarketTypeBadge({ type }: { type: string }) {
  return (
    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
      {MARKET_TYPE_LABEL[type] ?? type}
    </span>
  );
}
