"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { formatOdds } from "@/lib/odds-utils";

interface SelectionExposure {
  id: string;
  name: string;
  line: string | null;
  consensusOdds: number | null;
  liveExposure: number;
}

interface MarketExposure {
  marketId: string;
  marketName: string;
  marketStatus: string;
  event: string;
  sport: string;
  startTime: string;
  totalExposure: number;
  selections: SelectionExposure[];
}

export default function AdminPage() {
  const [exposure, setExposure] = useState<MarketExposure[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function loadExposure() {
    const res = await fetch("/api/admin/exposure");
    if (res.ok) setExposure(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    loadExposure();
    const interval = setInterval(loadExposure, 30000);
    return () => clearInterval(interval);
  }, []);

  async function handleSuspend(marketId: string, currentStatus: string) {
    setSuspending(marketId);
    const newStatus = currentStatus === "SUSPENDED" ? "OPEN" : "SUSPENDED";
    try {
      const res = await fetch(`/api/admin/markets/${marketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setMessage(`Market ${newStatus === "SUSPENDED" ? "suspended" : "reopened"}`);
        await loadExposure();
      }
    } finally {
      setSuspending(null);
      setTimeout(() => setMessage(""), 3000);
    }
  }

  const totalPlatformExposure = exposure.reduce(
    (sum, m) => sum + m.totalExposure,
    0
  );

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin — Exposure Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Live risk exposure across all open markets
          </p>
        </div>
        <button
          onClick={loadExposure}
          className="px-4 py-2 bg-brand-surface border border-border rounded-lg text-sm hover:bg-accent transition-colors"
        >
          Refresh
        </button>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-brand-green/15 text-brand-green text-sm">
          {message}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-5 bg-brand-card rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Total Platform Exposure</p>
          <p className="text-2xl font-bold text-brand-red mt-1">
            {formatCurrency(totalPlatformExposure)}
          </p>
        </div>
        <div className="p-5 bg-brand-card rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Open Markets</p>
          <p className="text-2xl font-bold mt-1">
            {exposure.filter((m) => m.marketStatus === "OPEN").length}
          </p>
        </div>
        <div className="p-5 bg-brand-card rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Suspended Markets</p>
          <p className="text-2xl font-bold text-brand-gold mt-1">
            {exposure.filter((m) => m.marketStatus === "SUSPENDED").length}
          </p>
        </div>
      </div>

      {/* Markets table */}
      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-4">
          {exposure.map((market) => (
            <div
              key={market.marketId}
              className="bg-brand-card rounded-xl border border-border overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div>
                  <p className="font-semibold">
                    {market.event} — {market.marketName}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {market.sport}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <ExposureBar
                    value={market.totalExposure}
                    max={100000}
                  />
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      market.marketStatus === "OPEN"
                        ? "bg-brand-green/15 text-brand-green"
                        : "bg-brand-gold/15 text-brand-gold"
                    }`}
                  >
                    {market.marketStatus}
                  </span>
                  <button
                    onClick={() => handleSuspend(market.marketId, market.marketStatus)}
                    disabled={suspending === market.marketId}
                    className="px-3 py-1 text-xs border border-border rounded hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {market.marketStatus === "SUSPENDED" ? "Reopen" : "Suspend"}
                  </button>
                </div>
              </div>

              <div className="p-3 grid grid-cols-2 gap-2">
                {market.selections.map((sel) => (
                  <div
                    key={sel.id}
                    className="flex items-center justify-between p-3 bg-brand-surface rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium">{sel.name}</p>
                      {sel.consensusOdds !== null && (
                        <p className="text-xs text-muted-foreground">
                          {formatOdds(sel.consensusOdds)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold text-sm ${
                          sel.liveExposure > 40000
                            ? "text-brand-red"
                            : sel.liveExposure > 20000
                            ? "text-brand-gold"
                            : "text-foreground"
                        }`}
                      >
                        {formatCurrency(sel.liveExposure)}
                      </p>
                      <p className="text-xs text-muted-foreground">liability</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExposureBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color =
    pct > 80 ? "bg-brand-red" : pct > 50 ? "bg-brand-gold" : "bg-brand-green";

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-brand-surface rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {formatCurrency(value)}
      </span>
    </div>
  );
}
