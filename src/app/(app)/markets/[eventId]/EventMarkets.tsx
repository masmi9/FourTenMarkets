"use client";

import { useState } from "react";
import { formatOdds } from "@/lib/odds-utils";
import BetSlip from "@/components/bet-slip/BetSlip";

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

export default function EventMarkets({
  markets,
}: {
  eventId: string;
  markets: Market[];
}) {
  const [activeSelection, setActiveSelection] = useState<Selection | null>(null);

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
              {market.selections.map((selection) => (
                <button
                  key={selection.id}
                  onClick={() => setActiveSelection(selection)}
                  disabled={market.status !== "OPEN"}
                  className="flex items-center justify-between p-4 bg-brand-surface rounded-lg border border-border hover:border-primary/60 hover:bg-accent transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {selection.name}
                      {selection.line ? (
                        <span className="text-muted-foreground"> {selection.line}</span>
                      ) : null}
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
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tap to bet
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bet Slip drawer */}
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
  const labels: Record<string, string> = {
    MONEYLINE: "Moneyline",
    SPREAD: "Spread",
    TOTAL: "Total",
    PLAYER_PROP: "Player Prop",
  };
  return (
    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
      {labels[type] ?? type}
    </span>
  );
}
