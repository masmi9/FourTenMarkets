import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const [wallet, recentBets, activeBetCount] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: user.userId } }),
    prisma.bet.findMany({
      where: { userId: user.userId },
      orderBy: { placedAt: "desc" },
      take: 5,
      include: {
        selection: {
          include: {
            market: { include: { event: true } },
          },
        },
        settlement: true,
      },
    }),
    prisma.bet.count({ where: { userId: user.userId, status: "ACTIVE" } }),
  ]);

  const balance = wallet ? parseFloat(wallet.balance.toString()) : 0;
  const locked = wallet ? parseFloat(wallet.lockedBalance.toString()) : 0;
  const available = balance - locked;

  const wonBets = recentBets.filter((b) => b.status === "WON").length;
  const lostBets = recentBets.filter((b) => b.status === "LOST").length;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          Welcome back{user.email ? `, ${user.email.split("@")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">Here&apos;s your account overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Available Balance"
          value={formatCurrency(available)}
          accent="green"
        />
        <StatCard
          label="Locked in Bets"
          value={formatCurrency(locked)}
          accent="gold"
        />
        <StatCard
          label="Active Bets"
          value={activeBetCount.toString()}
          accent="default"
        />
        <StatCard
          label="Recent Record"
          value={`${wonBets}W / ${lostBets}L`}
          accent="default"
        />
      </div>

      {/* Quick Actions */}
      <div className="flex gap-4">
        <Link
          href="/markets"
          className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
        >
          Browse Markets
        </Link>
        <Link
          href="/wallet"
          className="px-5 py-2.5 border border-border text-foreground font-semibold rounded-lg hover:bg-accent transition-colors"
        >
          Add Funds
        </Link>
      </div>

      {/* Recent Bets */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Bets</h2>
          <Link href="/bets?tab=history" className="text-sm text-primary hover:underline">
            View history
          </Link>
        </div>

        {recentBets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-brand-card rounded-xl border border-border">
            No bets yet.{" "}
            <Link href="/markets" className="text-primary hover:underline">
              Find a market to bet on
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recentBets.map((bet) => (
              <div
                key={bet.id}
                className="flex items-center justify-between p-4 bg-brand-card rounded-xl border border-border"
              >
                <div>
                  <p className="font-medium">
                    {bet.selection.name}
                    {bet.selection.line ? ` ${bet.selection.line}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {bet.selection.market.event.awayTeam} @{" "}
                    {bet.selection.market.event.homeTeam} •{" "}
                    {formatDate(bet.placedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <BetStatusBadge status={bet.status} />
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(parseFloat(bet.stake.toString()))} @{" "}
                    {bet.odds > 0 ? "+" : ""}
                    {bet.odds}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "green" | "gold" | "red" | "default";
}) {
  const valueColor = {
    green: "text-brand-green",
    gold: "text-brand-gold",
    red: "text-brand-red",
    default: "text-foreground",
  }[accent];

  return (
    <div className="p-5 bg-brand-card rounded-xl border border-border">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

function BetStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-blue-500/15 text-blue-400",
    WON: "bg-brand-green/15 text-brand-green",
    LOST: "bg-brand-red/15 text-brand-red",
    VOIDED: "bg-muted text-muted-foreground",
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? styles.ACTIVE}`}
    >
      {status}
    </span>
  );
}
