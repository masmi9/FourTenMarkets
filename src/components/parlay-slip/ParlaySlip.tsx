"use client";

import { useState, useMemo } from "react";
import { useParlay } from "@/context/ParlayContext";
import { americanToDecimal, decimalToAmerican, formatOdds } from "@/lib/odds-utils";

interface LegResult {
  selectionId: string;
  decision: "ACCEPT" | "COUNTER" | "REJECT";
  acceptedOdds: number;
  reason?: string;
}

interface ParlayResponse {
  parlayId: string;
  decision: "ACCEPT" | "COUNTER" | "REJECT";
  legs: LegResult[];
  combinedOdds: number;
  potentialPayout: number;
  stake: number;
  rejectReason?: string;
  expiresAt?: string;
}

export default function ParlaySlip() {
  const { legs, removeLeg, updateOdds, clear } = useParlay();
  const [open, setOpen] = useState(false);
  const [stake, setStake] = useState("");
  const [result, setResult] = useState<ParlayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Live combined odds preview as user edits legs
  const previewCombinedOdds = useMemo(() => {
    if (legs.length < 2) return null;
    const combined = legs.reduce(
      (acc, leg) => {
        const decimal = americanToDecimal(leg.requestedOdds);
        return acc * decimal;
      },
      1
    );
    return decimalToAmerican(combined);
  }, [legs]);

  const previewPayout = useMemo(() => {
    const s = parseFloat(stake);
    if (!previewCombinedOdds || isNaN(s) || s <= 0) return null;
    return (s * americanToDecimal(previewCombinedOdds)).toFixed(2);
  }, [previewCombinedOdds, stake]);

  async function handleRequest() {
    setError("");
    const s = parseFloat(stake);
    if (isNaN(s) || s <= 0) { setError("Enter a valid stake"); return; }
    if (legs.length < 2) { setError("Add at least 2 legs"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/bets/parlay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legs: legs.map((l) => ({ selectionId: l.selectionId, requestedOdds: l.requestedOdds })),
          stake: s,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Request failed"); return; }
      setResult(data);

      // Start countdown for counter offers
      if (data.decision === "COUNTER" && data.expiresAt) {
        const expiry = new Date(data.expiresAt).getTime();
        const tick = () => {
          const remaining = Math.max(0, Math.round((expiry - Date.now()) / 1000));
          setCountdown(remaining);
          if (remaining > 0) setTimeout(tick, 1000);
        };
        tick();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!result) return;
    setLoading(true);
    try {
      const res = await fetch("/api/bets/parlay/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parlayId: result.parlayId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Confirm failed"); return; }
      setConfirmed(true);
      clear();
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setConfirmed(false);
    setStake("");
    setError("");
    setCountdown(null);
  }

  if (legs.length === 0 && !open) return null;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg font-semibold text-sm hover:bg-primary/90 transition-colors"
      >
        <span>Parlay Slip</span>
        {legs.length > 0 && (
          <span className="bg-brand-gold text-black text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {legs.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 bg-brand-surface border border-border rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">
              Parlay Slip{" "}
              {legs.length > 0 && (
                <span className="text-muted-foreground">({legs.length} legs)</span>
              )}
            </h3>
            <div className="flex gap-2">
              {legs.length > 0 && !result && (
                <button
                  onClick={() => { clear(); setStake(""); setError(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {confirmed ? (
              <div className="text-center py-6 space-y-2">
                <div className="text-2xl">🎯</div>
                <p className="font-semibold text-brand-green">Parlay Placed!</p>
                <p className="text-xs text-muted-foreground">Good luck!</p>
                <button onClick={handleReset} className="text-xs text-primary hover:underline mt-2">
                  Build another parlay
                </button>
              </div>
            ) : result ? (
              /* Result screen */
              <div className="space-y-3">
                {result.decision === "REJECT" ? (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">
                    <p className="font-semibold text-red-400">Parlay Rejected</p>
                    <p className="text-muted-foreground mt-1">{result.rejectReason}</p>
                  </div>
                ) : (
                  <>
                    <div className={`rounded-lg p-3 text-sm border ${
                      result.decision === "ACCEPT"
                        ? "bg-brand-green/10 border-brand-green/30"
                        : "bg-yellow-500/10 border-yellow-500/30"
                    }`}>
                      <p className={`font-semibold ${result.decision === "ACCEPT" ? "text-brand-green" : "text-yellow-400"}`}>
                        {result.decision === "ACCEPT" ? "Parlay Accepted!" : "Counter Offer"}
                      </p>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Combined Odds</span>
                          <span className="text-foreground font-mono">{formatOdds(result.combinedOdds)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Potential Payout</span>
                          <span className="text-brand-green font-mono">${result.potentialPayout.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stake</span>
                          <span className="font-mono">${result.stake.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Per-leg breakdown */}
                    <div className="space-y-1">
                      {result.legs.map((leg, i) => {
                        const draft = legs.find((l) => l.selectionId === leg.selectionId);
                        return (
                          <div key={i} className="flex items-center justify-between text-xs px-1">
                            <span className="text-muted-foreground truncate max-w-[140px]">
                              {draft?.selectionName ?? leg.selectionId}
                            </span>
                            <span className={`font-mono font-medium ${
                              leg.decision === "ACCEPT" ? "text-brand-green" :
                              leg.decision === "COUNTER" ? "text-yellow-400" : "text-red-400"
                            }`}>
                              {leg.decision === "REJECT" ? "REJECT" : formatOdds(leg.acceptedOdds)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {result.decision === "COUNTER" && (
                      <>
                        {countdown !== null && countdown > 0 && (
                          <p className="text-xs text-center text-muted-foreground">
                            Offer expires in {countdown}s
                          </p>
                        )}
                        {(countdown === null || countdown > 0) ? (
                          <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                          >
                            {loading ? "Confirming..." : "Confirm Parlay"}
                          </button>
                        ) : (
                          <p className="text-xs text-center text-red-400">Offer expired</p>
                        )}
                      </>
                    )}
                  </>
                )}
                <button onClick={handleReset} className="w-full text-xs text-muted-foreground hover:text-foreground py-1">
                  ← Back to slip
                </button>
              </div>
            ) : (
              /* Leg builder */
              <>
                {legs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Click "Add to Parlay" on any selection to build your slip.
                  </p>
                ) : (
                  legs.map((leg) => (
                    <div key={leg.selectionId} className="bg-brand-card rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">{leg.eventLabel}</p>
                          <p className="text-sm font-medium truncate">{leg.selectionName}</p>
                          <p className="text-xs text-muted-foreground">{leg.marketType}</p>
                        </div>
                        <button
                          onClick={() => removeLeg(leg.selectionId)}
                          className="text-muted-foreground hover:text-red-400 text-lg leading-none flex-shrink-0"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">Odds</label>
                        <input
                          type="number"
                          value={leg.requestedOdds}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            if (!isNaN(v)) updateOdds(leg.selectionId, v);
                          }}
                          className="flex-1 bg-background border border-border rounded px-2 py-1 text-sm font-mono text-center"
                        />
                      </div>
                    </div>
                  ))
                )}

                {legs.length >= 2 && (
                  <>
                    {/* Combined odds preview */}
                    <div className="bg-brand-card rounded-lg p-3 text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Combined Odds</span>
                        <span className="font-mono font-semibold">
                          {previewCombinedOdds !== null ? formatOdds(previewCombinedOdds) : "—"}
                        </span>
                      </div>
                      {previewPayout && stake && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Potential Payout</span>
                          <span className="font-mono text-brand-green">${previewPayout}</span>
                        </div>
                      )}
                    </div>

                    {/* Stake input */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">$</span>
                        <input
                          type="number"
                          placeholder="Stake"
                          value={stake}
                          onChange={(e) => setStake(e.target.value)}
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <div className="flex gap-1">
                        {[10, 25, 50, 100].map((amt) => (
                          <button
                            key={amt}
                            onClick={() => setStake(String(amt))}
                            className="flex-1 text-xs bg-accent hover:bg-accent/80 rounded py-1.5 transition-colors"
                          >
                            ${amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {error && <p className="text-xs text-red-400">{error}</p>}

                    <button
                      onClick={handleRequest}
                      disabled={loading || !stake}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {loading ? "Processing..." : `Request ${legs.length}-Leg Parlay`}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
