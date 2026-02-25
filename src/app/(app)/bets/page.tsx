import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatOdds } from "@/lib/odds-utils";
import { Prisma } from "@prisma/client";

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

export default async function BetsPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const bets = await prisma.bet.findMany({
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
  });

  const active = bets.filter((b) => b.status === "ACTIVE");
  const settled = bets.filter((b) => b.status !== "ACTIVE");

  const totalWon = settled
    .filter((b) => b.status === "WON")
    .reduce((sum, b) => sum + parseFloat(b.settlement?.payout.toString() ?? "0"), 0);
  const totalStaked = bets.reduce(
    (sum, b) => sum + parseFloat(b.stake.toString()),
    0
  );

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">My Bets</h1>
        <div className="flex gap-8 mt-3 text-sm text-muted-foreground">
          <span>
            Total staked:{" "}
            <span className="text-foreground font-medium">
              {formatCurrency(totalStaked)}
            </span>
          </span>
          <span>
            Total won:{" "}
            <span className="text-brand-green font-medium">
              {formatCurrency(totalWon)}
            </span>
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

      {/* Active Bets */}
      {active.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Active ({active.length})</h2>
          <div className="space-y-3">
            {active.map((bet) => (
              <BetRow key={bet.id} bet={bet} />
            ))}
          </div>
        </section>
      )}

      {/* Settled Bets */}
      <section>
        <h2 className="text-lg font-semibold mb-3">History</h2>
        {settled.length === 0 ? (
          <p className="text-muted-foreground">No settled bets yet.</p>
        ) : (
          <div className="space-y-3">
            {settled.map((bet) => (
              <BetRow key={bet.id} bet={bet} />
            ))}
          </div>
        )}
      </section>
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

