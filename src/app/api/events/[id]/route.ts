import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis, redisKeys } from "@/lib/redis";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      league: { include: { sport: true } },
      markets: {
        include: {
          selections: {
            include: {
              consensusOdds: true,
              position: true,
            },
          },
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Enrich with live Redis exposure data
  const marketsWithExposure = await Promise.all(
    event.markets.map(async (market) => ({
      id: market.id,
      name: market.name,
      type: market.type,
      status: market.status,
      selections: await Promise.all(
        market.selections.map(async (sel) => {
          const liveExposure = await redis.get(redisKeys.exposure(sel.id));
          return {
            id: sel.id,
            name: sel.name,
            line: sel.line,
            consensus: sel.consensusOdds
              ? {
                  odds: sel.consensusOdds.odds,
                  impliedProb: parseFloat(sel.consensusOdds.impliedProb.toString()),
                  lineMovement: parseFloat(sel.consensusOdds.lineMovement.toString()),
                  updatedAt: sel.consensusOdds.updatedAt,
                }
              : null,
            exposure: parseFloat(liveExposure ?? "0"),
          };
        })
      ),
    }))
  );

  return NextResponse.json({
    id: event.id,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    startTime: event.startTime,
    status: event.status,
    league: event.league.name,
    sport: event.league.sport.name,
    markets: marketsWithExposure,
  });
}
