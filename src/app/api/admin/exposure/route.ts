import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis, redisKeys } from "@/lib/redis";

export async function GET(request: NextRequest) {
  const role = request.headers.get("x-user-role");
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all open markets with selections
  const markets = await prisma.market.findMany({
    where: { status: { not: "CLOSED" } },
    include: {
      selections: { include: { consensusOdds: true } },
      event: { include: { league: { include: { sport: true } } } },
    },
    orderBy: { event: { startTime: "asc" } },
    take: 100,
  });

  const result = await Promise.all(
    markets.map(async (market) => {
      const selectionsWithExposure = await Promise.all(
        market.selections.map(async (sel) => {
          const liveExposure = parseFloat(
            (await redis.get(redisKeys.exposure(sel.id))) ?? "0"
          );
          return {
            id: sel.id,
            name: sel.name,
            line: sel.line,
            consensusOdds: sel.consensusOdds?.odds ?? null,
            liveExposure,
          };
        })
      );

      const totalMarketExposure = selectionsWithExposure.reduce(
        (sum, s) => sum + s.liveExposure,
        0
      );

      return {
        marketId: market.id,
        marketName: market.name,
        marketStatus: market.status,
        event: `${market.event.awayTeam} @ ${market.event.homeTeam}`,
        sport: market.event.league.sport.name,
        startTime: market.event.startTime,
        totalExposure: totalMarketExposure,
        selections: selectionsWithExposure,
      };
    })
  );

  // Sort by highest exposure first
  result.sort((a, b) => b.totalExposure - a.totalExposure);

  return NextResponse.json(result);
}
