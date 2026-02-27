import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incrementDailyStake } from "@/lib/pricing-engine";
import { parlayConfirmSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parlayConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { parlayId } = parsed.data;

  const parlay = await prisma.parlay.findUnique({
    where: { id: parlayId },
    include: { legs: true },
  });

  if (!parlay) return NextResponse.json({ error: "Parlay not found" }, { status: 404 });
  if (parlay.userId !== userId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (parlay.status !== "PENDING") {
    return NextResponse.json({ error: "Parlay is not awaiting confirmation" }, { status: 400 });
  }

  // 2-minute expiry window from placement
  const expiryMs = parlay.placedAt.getTime() + 2 * 60 * 1000;
  if (Date.now() > expiryMs) {
    await prisma.parlay.update({ where: { id: parlayId }, data: { status: "VOIDED" } });
    return NextResponse.json({ error: "Counter offer expired" }, { status: 400 });
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const stake = parseFloat(parlay.stake.toString());
  const available =
    parseFloat(wallet.balance.toString()) - parseFloat(wallet.lockedBalance.toString());
  if (stake > available) {
    return NextResponse.json(
      { error: `Insufficient balance. Available: $${available.toFixed(2)}` },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.parlay.update({ where: { id: parlayId }, data: { status: "ACTIVE" } }),
    prisma.wallet.update({
      where: { userId },
      data: { lockedBalance: { increment: stake } },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: "BET_STAKE",
        amount: stake,
        reference: parlayId,
        description: `${parlay.legs.length}-leg parlay confirmed at ${parlay.combinedOdds >= 0 ? "+" : ""}${parlay.combinedOdds}`,
      },
    }),
  ]);

  await incrementDailyStake(userId, stake);

  return NextResponse.json({
    parlayId,
    status: "ACTIVE",
    combinedOdds: parlay.combinedOdds,
    potentialPayout: parseFloat(parlay.potentialPayout.toString()),
  });
}
