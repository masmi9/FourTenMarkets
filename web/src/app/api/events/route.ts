import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get("sport");
  const status = searchParams.get("status") ?? "UPCOMING";

  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      OR: status === "UPCOMING"
        ? [
            { status: "LIVE", ...(sport ? { league: { sport: { slug: sport } } } : {}) },
            { status: "UPCOMING", startTime: { gte: now }, ...(sport ? { league: { sport: { slug: sport } } } : {}) },
          ]
        : [
            {
              status: status as "UPCOMING" | "LIVE" | "SETTLED" | "CANCELLED",
              ...(sport ? { league: { sport: { slug: sport } } } : {}),
            },
          ],
    },
    orderBy: { startTime: "asc" },
    take: 50,
    include: {
      league: { include: { sport: true } },
      markets: {
        where: { status: { not: "CLOSED" } },
        include: {
          selections: {
            include: { consensusOdds: true },
          },
        },
      },
    },
  });

  return NextResponse.json(
    events.map((event) => ({
      id: event.id,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      startTime: event.startTime,
      status: event.status,
      league: event.league.name,
      sport: event.league.sport.name,
      sportSlug: event.league.sport.slug,
      markets: event.markets.map((m) => ({
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
      })),
    }))
  );
}
