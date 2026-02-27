import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));

  const bets = await prisma.bet.findMany({
    where: {
      userId,
      ...(status ? { status: status as "ACTIVE" | "WON" | "LOST" | "VOIDED" } : {}),
    },
    orderBy: { placedAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      selection: {
        include: {
          market: {
            include: { event: { include: { league: { include: { sport: true } } } } },
          },
        },
      },
      settlement: true,
    },
  });

  return NextResponse.json(
    bets.map((bet) => ({
      id: bet.id,
      odds: bet.odds,
      stake: parseFloat(bet.stake.toString()),
      potentialPayout: parseFloat(bet.potentialPayout.toString()),
      status: bet.status,
      placedAt: bet.placedAt,
      selection: {
        id: bet.selection.id,
        name: bet.selection.name,
        line: bet.selection.line,
        market: {
          id: bet.selection.market.id,
          name: bet.selection.market.name,
          type: bet.selection.market.type,
          event: {
            id: bet.selection.market.event.id,
            homeTeam: bet.selection.market.event.homeTeam,
            awayTeam: bet.selection.market.event.awayTeam,
            startTime: bet.selection.market.event.startTime,
            sport: bet.selection.market.event.league.sport.name,
          },
        },
      },
      settlement: bet.settlement
        ? {
            result: bet.settlement.result,
            payout: parseFloat(bet.settlement.payout.toString()),
            settledAt: bet.settlement.settledAt,
          }
        : null,
    }))
  );
}
