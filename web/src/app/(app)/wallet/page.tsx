"use client";

import { useState, useEffect } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface WalletData {
  balance: number;
  lockedBalance: number;
  available: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [loading, setLoading] = useState<"deposit" | "withdraw" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadWallet() {
    const [walletRes, txRes] = await Promise.all([
      fetch("/api/wallet"),
      fetch("/api/wallet/transactions?limit=20"),
    ]);
    if (walletRes.ok) setWallet(await walletRes.json());
    if (txRes.ok) {
      const data = await txRes.json();
      setTransactions(data.transactions);
    }
  }

  useEffect(() => { loadWallet(); }, []);

  async function handleDeposit() {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;

    setLoading("deposit");
    setMessage(null);
    try {
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
      } else {
        setMessage({ type: "success", text: `Deposited ${formatCurrency(amount)} successfully` });
        setDepositAmount("");
        await loadWallet();
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleWithdraw() {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) return;

    setLoading("withdraw");
    setMessage(null);
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
      } else {
        setMessage({ type: "success", text: `Withdrew ${formatCurrency(amount)} successfully` });
        setWithdrawAmount("");
        await loadWallet();
      }
    } finally {
      setLoading(null);
    }
  }

  const txTypeColor: Record<string, string> = {
    DEPOSIT: "text-brand-green",
    WITHDRAWAL: "text-brand-red",
    BET_STAKE: "text-brand-gold",
    BET_PAYOUT: "text-brand-green",
    BET_REFUND: "text-blue-400",
  };

  const txTypeSign: Record<string, string> = {
    DEPOSIT: "+",
    WITHDRAWAL: "-",
    BET_STAKE: "-",
    BET_PAYOUT: "+",
    BET_REFUND: "+",
  };

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Wallet</h1>

      {/* Balance cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-5 bg-brand-card rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Total Balance</p>
          <p className="text-2xl font-bold text-brand-green mt-1">
            {wallet ? formatCurrency(wallet.balance) : "—"}
          </p>
        </div>
        <div className="p-5 bg-brand-card rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Available</p>
          <p className="text-2xl font-bold mt-1">
            {wallet ? formatCurrency(wallet.available) : "—"}
          </p>
        </div>
        <div className="p-5 bg-brand-card rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">Locked in Bets</p>
          <p className="text-2xl font-bold text-brand-gold mt-1">
            {wallet ? formatCurrency(wallet.lockedBalance) : "—"}
          </p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-brand-green/15 text-brand-green"
              : "bg-destructive/15 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Deposit / Withdraw */}
      <div className="grid grid-cols-2 gap-6">
        <div className="p-5 bg-brand-card rounded-xl border border-border space-y-4">
          <h2 className="font-semibold">Deposit Funds</h2>
          <p className="text-xs text-muted-foreground">
            Simulated deposit — no real money
          </p>
          <div className="flex gap-2">
            {[100, 250, 500, 1000].map((amt) => (
              <button
                key={amt}
                onClick={() => setDepositAmount(amt.toString())}
                className="flex-1 py-1.5 text-sm bg-brand-surface border border-border rounded hover:border-primary/50 transition-colors"
              >
                ${amt}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="Custom amount"
            className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleDeposit}
            disabled={loading === "deposit"}
            className="w-full py-2.5 bg-brand-green text-black font-semibold rounded-lg hover:bg-brand-green/90 disabled:opacity-50 transition-colors"
          >
            {loading === "deposit" ? "Processing..." : "Deposit"}
          </button>
        </div>

        <div className="p-5 bg-brand-card rounded-xl border border-border space-y-4">
          <h2 className="font-semibold">Withdraw Funds</h2>
          <p className="text-xs text-muted-foreground">
            Available balance only (locked funds excluded)
          </p>
          <div className="h-[36px]" /> {/* Spacer to align with deposit */}
          <input
            type="number"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="Amount to withdraw"
            className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleWithdraw}
            disabled={loading === "withdraw"}
            className="w-full py-2.5 bg-brand-surface border border-border text-foreground font-semibold rounded-lg hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {loading === "withdraw" ? "Processing..." : "Withdraw"}
          </button>
        </div>
      </div>

      {/* Transaction history */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Transaction History</h2>
        {transactions.length === 0 ? (
          <p className="text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-4 bg-brand-card rounded-xl border border-border"
              >
                <div>
                  <p className="font-medium text-sm">{tx.type.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tx.description ?? "—"} • {formatDate(tx.createdAt)}
                  </p>
                </div>
                <p
                  className={`font-bold ${
                    txTypeColor[tx.type] ?? "text-foreground"
                  }`}
                >
                  {txTypeSign[tx.type]}
                  {formatCurrency(tx.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
