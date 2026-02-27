import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { betConfirmSchema } from "@/lib/validators";
import { incrementExposure, incrementDailyStake } from "@/lib/pricing-engine";
import { calcPayout } from "@/lib/odds-utils";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = betConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { requestId } = parsed.data;

  const betRequest = await prisma.betRequest.findUnique({
    where: { id: requestId },
    include: { selection: { include: { market: true } } },
  });

  if (!betRequest) {
    return NextResponse.json({ error: "Bet request not found" }, { status: 404 });
  }
  if (betRequest.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (betRequest.status !== "COUNTERED") {
    return NextResponse.json(
      { error: "This request is not in COUNTERED status" },
      { status: 400 }
    );
  }
  if (betRequest.expiresAt && betRequest.expiresAt < new Date()) {
    await prisma.betRequest.update({
      where: { id: requestId },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "Counter offer has expired" }, { status: 410 });
  }
  if (betRequest.selection.market.status !== "OPEN") {
    return NextResponse.json({ error: "Market is no longer open" }, { status: 400 });
  }

  const finalOdds = betRequest.counteredOdds!;
  const stake = parseFloat(betRequest.stake.toString());
  const potentialPayout = calcPayout(stake, finalOdds);
  const liability = potentialPayout - stake;

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const available =
    parseFloat(wallet.balance.toString()) -
    parseFloat(wallet.lockedBalance.toString());

  if (stake > available) {
    return NextResponse.json(
      { error: `Insufficient balance. Available: $${available.toFixed(2)}` },
      { status: 400 }
    );
  }

  const [, bet] = await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { lockedBalance: { increment: stake } },
    }),
    prisma.bet.create({
      data: {
        betRequestId: requestId,
        userId,
        selectionId: betRequest.selectionId,
        odds: finalOdds,
        stake,
        potentialPayout,
        status: "ACTIVE",
      },
    }),
    prisma.betRequest.update({
      where: { id: requestId },
      data: { status: "CONFIRMED" },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: "BET_STAKE",
        amount: stake,
        reference: requestId,
        description: `Counter accepted at ${finalOdds > 0 ? "+" : ""}${finalOdds}`,
      },
    }),
  ]);

  await incrementExposure(betRequest.selectionId, liability);
  await incrementDailyStake(userId, stake);

  return NextResponse.json({
    betId: bet.id,
    odds: finalOdds,
    stake,
    potentialPayout,
    status: "ACTIVE",
  });
}
