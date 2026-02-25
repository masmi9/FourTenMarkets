import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateParlayRequest } from "@/lib/parlay-engine";
import { incrementDailyStake } from "@/lib/pricing-engine";
import { parlayRequestSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parlayRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { legs, stake } = parsed.data;

  // Verify all selections exist and their markets are open
  for (const leg of legs) {
    const selection = await prisma.selection.findUnique({
      where: { id: leg.selectionId },
      include: { market: true },
    });
    if (!selection) {
      return NextResponse.json({ error: `Selection not found: ${leg.selectionId}` }, { status: 404 });
    }
    if (selection.market.status !== "OPEN") {
      return NextResponse.json(
        { error: `Market for "${selection.name}" is not open` },
        { status: 400 }
      );
    }
  }

  // Check wallet balance
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const available =
    parseFloat(wallet.balance.toString()) - parseFloat(wallet.lockedBalance.toString());
  if (stake > available) {
    return NextResponse.json(
      { error: `Insufficient balance. Available: $${available.toFixed(2)}` },
      { status: 400 }
    );
  }

  // Run parlay pricing engine
  const result = await evaluateParlayRequest({ userId, legs, stake });

  const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

  // Create Parlay record
  const parlay = await prisma.parlay.create({
    data: {
      userId,
      stake,
      combinedOdds: result.combinedOdds,
      potentialPayout: result.potentialPayout,
      status: result.decision === "ACCEPT"
        ? "ACTIVE"
        : result.decision === "COUNTER"
        ? "PENDING"
        : "VOIDED",
      legs: {
        create: result.legs.map((leg) => ({
          selectionId: leg.selectionId,
          requestedOdds: leg.requestedOdds,
          acceptedOdds: leg.acceptedOdds,
        })),
      },
    },
    include: { legs: { include: { selection: { include: { market: { include: { event: true } } } } } } },
  });

  // If accepted: lock stake immediately
  if (result.decision === "ACCEPT") {
    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: { lockedBalance: { increment: stake } },
      }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          type: "BET_STAKE",
          amount: stake,
          reference: parlay.id,
          description: `${legs.length}-leg parlay at ${result.combinedOdds >= 0 ? "+" : ""}${result.combinedOdds}`,
        },
      }),
    ]);
    await incrementDailyStake(userId, stake);
  }

  return NextResponse.json({
    parlayId: parlay.id,
    decision: result.decision,
    legs: result.legs,
    combinedOdds: result.combinedOdds,
    potentialPayout: result.potentialPayout,
    stake,
    rejectReason: result.rejectReason ?? null,
    expiresAt: result.decision === "COUNTER" ? expiresAt.toISOString() : null,
  });
}

// GET /api/bets/parlay — user's parlay history
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parlays = await prisma.parlay.findMany({
    where: { userId },
    orderBy: { placedAt: "desc" },
    take: 20,
    include: {
      legs: {
        include: {
          selection: {
            include: {
              market: { include: { event: true } },
              consensusOdds: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json(parlays);
}
