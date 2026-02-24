"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { formatOdds, calcPayout } from "@/lib/odds-utils";

interface Selection {
  id: string;
  name: string;
  line?: string | null;
  consensus: { odds: number; impliedProb: number } | null;
}

interface BetResult {
  requestId: string;
  decision: "ACCEPT" | "COUNTER" | "REJECT";
  requestedOdds: number;
  acceptedOdds: number | null;
  potentialPayout: number | null;
  stake: number;
  rejectReason: string | null;
  counterReason: string | null;
  expiresAt: string | null;
}

export default function BetSlip({
  selection,
  onClose,
}: {
  selection: Selection;
  onClose: () => void;
}) {
  const [requestedOdds, setRequestedOdds] = useState(
    selection.consensus?.odds.toString() ?? "-110"
  );
  const [stake, setStake] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BetResult | null>(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const oddsNum = parseInt(requestedOdds, 10);
  const stakeNum = parseFloat(stake);
  const validOdds = !isNaN(oddsNum) && (oddsNum >= 100 || oddsNum <= -100);
  const validStake = !isNaN(stakeNum) && stakeNum > 0;
  const previewPayout =
    validOdds && validStake ? calcPayout(stakeNum, oddsNum) : null;

  async function handleRequest() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/bets/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectionId: selection.id,
          requestedOdds: oddsNum,
          stake: stakeNum,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!result) return;
    setConfirmLoading(true);
    try {
      const res = await fetch("/api/bets/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: result.requestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Confirmation failed");
        return;
      }
      setConfirmed(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setConfirmLoading(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-brand-surface border-l border-border shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-border">
        <h2 className="text-lg font-bold">Bet Slip</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xl"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-5">
        {/* Selection info */}
        <div className="p-4 bg-brand-card rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Selection</p>
          <p className="font-semibold mt-0.5">
            {selection.name}
            {selection.line ? ` ${selection.line}` : ""}
          </p>
          {selection.consensus && (
            <p className="text-sm text-muted-foreground mt-1">
              Market odds:{" "}
              <span className="text-foreground font-medium">
                {formatOdds(selection.consensus.odds)}
              </span>
            </p>
          )}
        </div>

        {/* If we have a result, show it */}
        {result && !confirmed ? (
          <ResultPanel
            result={result}
            onConfirm={handleConfirm}
            confirmLoading={confirmLoading}
            error={error}
          />
        ) : confirmed ? (
          <div className="text-center py-8 space-y-3">
            <div className="text-5xl">✅</div>
            <p className="text-xl font-bold text-brand-green">Bet Placed!</p>
            <p className="text-muted-foreground">
              {formatCurrency(stakeNum)} at {formatOdds(result?.acceptedOdds ?? oddsNum)}
            </p>
            <p className="text-sm text-muted-foreground">
              Potential payout:{" "}
              <span className="text-foreground">
                {formatCurrency(result?.potentialPayout ?? 0)}
              </span>
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Odds input */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Your Requested Odds (American)
              </label>
              <input
                type="number"
                value={requestedOdds}
                onChange={(e) => setRequestedOdds(e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-lg text-foreground text-lg font-bold focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="-110"
              />
              <p className="text-xs text-muted-foreground mt-1">
                e.g. +150, -110, +200
              </p>
            </div>

            {/* Stake input */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Stake ($)
              </label>
              <input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                min={1}
                max={5000}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-lg text-foreground text-lg focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="50"
              />
            </div>

            {/* Quick stake buttons */}
            <div className="flex gap-2">
              {[25, 50, 100, 250].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setStake(amount.toString())}
                  className="flex-1 py-1.5 text-sm bg-brand-card border border-border rounded-lg hover:border-primary/50 transition-colors"
                >
                  ${amount}
                </button>
              ))}
            </div>

            {/* Payout preview */}
            {previewPayout && (
              <div className="p-3 bg-brand-card rounded-lg border border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Potential payout</span>
                  <span className="font-medium text-brand-green">
                    {formatCurrency(previewPayout)}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Profit</span>
                  <span className="font-medium">
                    {formatCurrency(previewPayout - stakeNum)}
                  </span>
                </div>
              </div>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}

            <button
              onClick={handleRequest}
              disabled={loading || !validOdds || !validStake}
              className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg"
            >
              {loading ? "Evaluating..." : "Request Odds"}
            </button>

            <p className="text-xs text-muted-foreground text-center">
              The exchange will respond Accept, Counter, or Reject in real time
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  onConfirm,
  confirmLoading,
  error,
}: {
  result: BetResult;
  onConfirm: () => void;
  confirmLoading: boolean;
  error: string;
}) {
  if (result.decision === "REJECT") {
    return (
      <div className="text-center py-8 space-y-3">
        <div className="text-5xl">❌</div>
        <p className="text-xl font-bold text-brand-red">Rejected</p>
        <p className="text-muted-foreground text-sm">{result.rejectReason}</p>
      </div>
    );
  }

  if (result.decision === "ACCEPT") {
    return (
      <div className="space-y-4">
        <div className="text-center py-4">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-xl font-bold text-brand-green">Accepted!</p>
          <p className="text-muted-foreground text-sm mt-1">
            Your odds were accepted
          </p>
        </div>
        <div className="p-4 bg-brand-card rounded-xl border border-border space-y-2 text-sm">
          <Row label="Odds" value={formatOdds(result.acceptedOdds!)} />
          <Row label="Stake" value={formatCurrency(result.stake)} />
          <Row
            label="Potential Payout"
            value={formatCurrency(result.potentialPayout!)}
            accent="green"
          />
        </div>
        <p className="text-xs text-center text-brand-green">Bet placed automatically</p>
      </div>
    );
  }

  // COUNTER
  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <div className="text-4xl mb-2">🔄</div>
        <p className="text-xl font-bold text-brand-gold">Counter Offer</p>
        <p className="text-muted-foreground text-sm mt-1">{result.counterReason}</p>
      </div>

      <div className="p-4 bg-brand-card rounded-xl border border-border space-y-2 text-sm">
        <Row
          label="You requested"
          value={formatOdds(result.requestedOdds)}
        />
        <Row
          label="Our offer"
          value={formatOdds(result.acceptedOdds!)}
          accent="gold"
        />
        <div className="border-t border-border my-2" />
        <Row label="Stake" value={formatCurrency(result.stake)} />
        <Row
          label="Potential Payout"
          value={formatCurrency(result.potentialPayout!)}
          accent="green"
        />
      </div>

      {result.expiresAt && (
        <p className="text-xs text-center text-muted-foreground">
          Offer expires at {new Date(result.expiresAt).toLocaleTimeString()}
        </p>
      )}

      {error && <p className="text-destructive text-sm text-center">{error}</p>}

      <button
        onClick={onConfirm}
        disabled={confirmLoading}
        className="w-full py-3 bg-brand-gold text-black font-bold rounded-xl hover:bg-brand-gold/90 disabled:opacity-50 transition-colors"
      >
        {confirmLoading ? "Confirming..." : "Accept Counter Offer"}
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "gold";
}) {
  const valueClass =
    accent === "green"
      ? "text-brand-green font-bold"
      : accent === "gold"
      ? "text-brand-gold font-bold"
      : "font-medium";

  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}
