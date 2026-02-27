import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { formatOdds } from "@/lib/odds-utils";

export default async function MarketsPage() {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { status: "LIVE" },
        { status: "UPCOMING", startTime: { gte: now } },
      ],
    },
    orderBy: { startTime: "asc" },
    take: 50,
    include: {
      league: { include: { sport: true } },
      markets: {
        where: { status: "OPEN" },
        include: {
          selections: { include: { consensusOdds: true } },
        },
      },
    },
  });

  // Group by sport
  const bySport: Record<string, typeof events> = {};
  for (const event of events) {
    const sport = event.league.sport.name;
    if (!bySport[sport]) bySport[sport] = [];
    bySport[sport].push(event);
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Markets</h1>
        <p className="text-muted-foreground mt-1">
          Select a market to propose your own odds
        </p>
      </div>

      {Object.keys(bySport).length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          No open markets right now. Check back soon.
        </div>
      )}

      {Object.entries(bySport).map(([sport, sportEvents]) => (
        <section key={sport}>
          <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            {sport}
          </h2>
          <div className="space-y-3">
            {sportEvents.map((event) => {
              const moneyline = event.markets.find((m) => m.type === "MONEYLINE");
              const home = moneyline?.selections.find(
                (s) => s.name === event.homeTeam
              );
              const away = moneyline?.selections.find(
                (s) => s.name === event.awayTeam
              );

              return (
                <Link
                  key={event.id}
                  href={`/markets/${event.id}`}
                  className="block p-5 bg-brand-card rounded-xl border border-border hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {event.awayTeam} @ {event.homeTeam}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {event.league.name} • {formatDate(event.startTime)}
                      </p>
                    </div>

                    <div className="flex gap-3 items-center">
                      {event.status === "LIVE" && (
                        <span className="px-2 py-0.5 bg-brand-red/20 text-brand-red text-xs font-medium rounded animate-pulse">
                          LIVE
                        </span>
                      )}
                      <div className="flex gap-2 text-sm">
                        {away?.consensusOdds && (
                          <OddsChip
                            label={event.awayTeam.split(" ").pop()!}
                            odds={away.consensusOdds.odds}
                          />
                        )}
                        {home?.consensusOdds && (
                          <OddsChip
                            label={event.homeTeam.split(" ").pop()!}
                            odds={home.consensusOdds.odds}
                          />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {event.markets.length} market
                        {event.markets.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function OddsChip({ label, odds }: { label: string; odds: number }) {
  const isPositive = odds > 0;
  return (
    <div className="px-3 py-1.5 bg-brand-surface rounded-lg border border-border text-center min-w-[70px]">
      <p className="text-xs text-muted-foreground truncate">{label}</p>
      <p
        className={`text-sm font-bold ${
          isPositive ? "text-brand-green" : "text-foreground"
        }`}
      >
        {formatOdds(odds)}
      </p>
    </div>
  );
}
