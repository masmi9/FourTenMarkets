import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { formatOdds } from "@/lib/odds-utils";
import EventMarkets from "./EventMarkets";

export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: { include: { sport: true } },
      markets: {
        where: { status: { not: "CLOSED" } },
        orderBy: { type: "asc" },
        include: {
          selections: {
            include: { consensusOdds: true },
          },
        },
      },
    },
  });

  if (!event) notFound();

  return (
    <div className="p-8 space-y-6">
      {/* Event header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span>{event.league.sport.name}</span>
          <span>•</span>
          <span>{event.league.name}</span>
          <span>•</span>
          <span>{formatDate(event.startTime)}</span>
          {event.status === "LIVE" && (
            <span className="px-2 py-0.5 bg-brand-red/20 text-brand-red text-xs font-medium rounded animate-pulse">
              LIVE
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold">
          {event.awayTeam} @ {event.homeTeam}
        </h1>
      </div>

      {/* Markets */}
      <EventMarkets
        eventId={event.id}
        markets={event.markets.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.type,
          status: m.status,
          selections: m.selections.map((s) => ({
            id: s.id,
            name: s.name,
            line: s.line,
            consensus: s.consensusOdds
              ? {
                  odds: s.consensusOdds.odds,
                  impliedProb: parseFloat(s.consensusOdds.impliedProb.toString()),
                  lineMovement: parseFloat(s.consensusOdds.lineMovement.toString()),
                }
              : null,
          })),
        }))}
      />
    </div>
  );
}
