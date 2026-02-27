import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatOdds } from "@/lib/odds-utils";
import { Prisma } from "@prisma/client";
import Link from "next/link";

type BetWithRelations = Prisma.BetGetPayload<{
  include: {
    selection: {
      include: {
        market: {
          include: {
            event: { include: { league: { include: { sport: true } } } };
          };
        };
      };
    };
    settlement: true;
  };
}>;

type ParlayWithLegs = Prisma.ParlayGetPayload<{
  include: {
    legs: {
      include: {
        selection: {
          include: {
            market: { include: { event: true } };
          };
        };
      };
    };
  };
}>;

export default async function BetsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "active" } = await searchParams;
  const user = await getAuthUser();
  if (!user) return null;

  const [bets, parlays] = await Promise.all([
    prisma.bet.findMany({
      where: { userId: user.userId },
      orderBy: { placedAt: "desc" },
      take: 100,
      include: {
        selection: {
          include: {
            market: {
              include: {
                event: { include: { league: { include: { sport: true } } } },
              },
            },
          },
        },
        settlement: true,
      },
    }),
    prisma.parlay.findMany({
      where: { userId: user.userId, status: { not: "PENDING" } },
      orderBy: { placedAt: "desc" },
      take: 50,
      include: {
        legs: {
          include: {
            selection: {
              include: { market: { include: { event: true } } },
            },
          },
        },
      },
    }),
  ]);

  const active = bets.filter((b) => b.status === "ACTIVE");
  const settled = bets.filter((b) => b.status !== "ACTIVE");
  const activeParlays = parlays.filter((p) => p.status === "ACTIVE");
  const settledParlays = parlays.filter((p) => p.status !== "ACTIVE");

  const totalWon = settled
    .filter((b) => b.status === "WON")
    .reduce((sum, b) => sum + parseFloat(b.settlement?.payout.toString() ?? "0"), 0);
  const totalStaked =
    bets.reduce((sum, b) => sum + parseFloat(b.stake.toString()), 0) +
    parlays.reduce((sum, p) => sum + parseFloat(p.stake.toString()), 0);

  const activeCount = active.length + activeParlays.length;
  const historyCount = settled.length + settledParlays.length;
  const showHistory = tab === "history";

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">My Bets</h1>
        <div className="flex gap-8 mt-3 text-sm text-muted-foreground">
          <span>
            Total staked:{" "}
            <span className="text-foreground font-medium">{formatCurrency(totalStaked)}</span>
          </span>
          <span>
            Total won:{" "}
            <span className="text-brand-green font-medium">{formatCurrency(totalWon)}</span>
          </span>
          <span>
            Record:{" "}
            <span className="text-foreground font-medium">
              {settled.filter((b) => b.status === "WON").length}W /{" "}
              {settled.filter((b) => b.status === "LOST").length}L
            </span>
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        <Link
          href="/bets"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            !showHistory
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Active
          {activeCount > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
              {activeCount}
            </span>
          )}
        </Link>
        <Link
          href="/bets?tab=history"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            showHistory
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          History
          {historyCount > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">
              {historyCount}
            </span>
          )}
        </Link>
      </div>

      {/* Active tab */}
      {!showHistory && (
        <>
          {activeCount === 0 ? (
            <div className="text-center py-16 text-muted-foreground bg-brand-card rounded-xl border border-border">
              No active bets.{" "}
              <Link href="/markets" className="text-primary hover:underline">
                Browse markets
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeParlays.map((p) => <ParlayRow key={p.id} parlay={p} />)}
              {active.map((bet) => <BetRow key={bet.id} bet={bet} />)}
            </div>
          )}
        </>
      )}

      {/* History tab */}
      {showHistory && (
        <>
          {historyCount === 0 ? (
            <p className="text-muted-foreground py-8">No settled bets yet.</p>
          ) : (
            <div className="space-y-3">
              {settledParlays.map((p) => <ParlayRow key={p.id} parlay={p} />)}
              {settled.map((bet) => <BetRow key={bet.id} bet={bet} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ParlayRow({ parlay }: { parlay: ParlayWithLegs }) {
  const stake = parseFloat(parlay.stake.toString());
  const payout = parseFloat(parlay.potentialPayout.toString());

  const statusStyles: Record<string, string> = {
    ACTIVE: "bg-blue-500/15 text-blue-400",
    WON: "bg-brand-green/15 text-brand-green",
    LOST: "bg-brand-red/15 text-brand-red",
    VOIDED: "bg-muted text-muted-foreground",
    PENDING: "bg-yellow-500/15 text-yellow-400",
  };

  return (
    <div className="p-4 bg-brand-card rounded-xl border border-border">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="font-semibold">
            {parlay.legs.length}-Leg Parlay
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(parlay.placedAt)}</p>
          <div className="mt-2 space-y-0.5">
            {parlay.legs.map((leg) => (
              <div key={leg.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  leg.result === "WON" ? "bg-brand-green" :
                  leg.result === "LOST" ? "bg-brand-red" :
                  leg.result === "VOID" || leg.result === "PUSHED" ? "bg-muted-foreground" :
                  "bg-blue-400"
                }`} />
                <span className="truncate max-w-[200px]">
                  {leg.selection.name}
                  {leg.selection.line ? ` ${leg.selection.line}` : ""}
                </span>
                <span className="font-mono ml-auto flex-shrink-0">
                  {formatOdds(leg.acceptedOdds)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-right space-y-1 ml-4 flex-shrink-0">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
            statusStyles[parlay.status] ?? statusStyles.ACTIVE
          }`}>
            {parlay.status}
          </span>
          <p className="text-sm font-bold">
            {formatCurrency(stake)} @{" "}
            <span className={parlay.combinedOdds > 0 ? "text-brand-green" : ""}>
              {formatOdds(parlay.combinedOdds)}
            </span>
          </p>
          {parlay.status === "ACTIVE" ? (
            <p className="text-xs text-muted-foreground">
              To win {formatCurrency(payout - stake)}
            </p>
          ) : parlay.status === "WON" ? (
            <p className="text-xs text-brand-green">Won {formatCurrency(payout)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BetRow({ bet }: { bet: BetWithRelations }) {
  const stake = parseFloat(bet.stake.toString());
  const payout = parseFloat(bet.potentialPayout.toString());
  const actualPayout = bet.settlement
    ? parseFloat(bet.settlement.payout.toString())
    : null;

  const statusStyles: Record<string, string> = {
    ACTIVE: "bg-blue-500/15 text-blue-400",
    WON: "bg-brand-green/15 text-brand-green",
    LOST: "bg-brand-red/15 text-brand-red",
    VOIDED: "bg-muted text-muted-foreground",
  };

  return (
    <div className="p-4 bg-brand-card rounded-xl border border-border">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="font-semibold">
            {bet.selection.name}
            {bet.selection.line ? ` ${bet.selection.line}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {bet.selection.market.event.awayTeam} @{" "}
            {bet.selection.market.event.homeTeam}
          </p>
          <p className="text-xs text-muted-foreground">
            {bet.selection.market.event.league.sport.name} •{" "}
            {bet.selection.market.name} • {formatDate(bet.placedAt)}
          </p>
        </div>

        <div className="text-right space-y-1">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
              statusStyles[bet.status] ?? statusStyles.ACTIVE
            }`}
          >
            {bet.status}
          </span>
          <p className="text-sm font-bold">
            {formatCurrency(stake)} @{" "}
            <span className={bet.odds > 0 ? "text-brand-green" : ""}>
              {formatOdds(bet.odds)}
            </span>
          </p>
          {bet.status === "ACTIVE" ? (
            <p className="text-xs text-muted-foreground">
              To win {formatCurrency(payout - stake)}
            </p>
          ) : bet.status === "WON" && actualPayout ? (
            <p className="text-xs text-brand-green">
              Won {formatCurrency(actualPayout)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
