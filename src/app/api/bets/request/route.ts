import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateBetRequest, incrementExposure, incrementDailyStake } from "@/lib/pricing-engine";
import { betRequestSchema } from "@/lib/validators";
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

  const parsed = betRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { selectionId, requestedOdds, stake } = parsed.data;

  // Verify selection and market are open
  const selection = await prisma.selection.findUnique({
    where: { id: selectionId },
    include: { market: true },
  });

  if (!selection) {
    return NextResponse.json({ error: "Selection not found" }, { status: 404 });
  }
  if (selection.market.status !== "OPEN") {
    return NextResponse.json({ error: "Market is not open for betting" }, { status: 400 });
  }

  // Check user has sufficient available balance
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

  // Run pricing engine
  const result = await evaluateBetRequest({ userId, selectionId, requestedOdds, stake });

  // Create BetRequest record
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minute expiry for counter offers

  const betRequest = await prisma.betRequest.create({
    data: {
      userId,
      selectionId,
      requestedOdds,
      stake,
      status: result.decision === "ACCEPT"
        ? "ACCEPTED"
        : result.decision === "COUNTER"
        ? "COUNTERED"
        : "REJECTED",
      counteredOdds: result.decision === "COUNTER" ? result.acceptedOdds : null,
      responseType: result.decision,
      processedAt: new Date(),
      expiresAt: result.decision === "COUNTER" ? expiresAt : null,
    },
  });

  // If accepted immediately — lock stake, create bet, update exposure
  if (result.decision === "ACCEPT") {
    const potentialPayout = calcPayout(stake, requestedOdds);
    const liability = potentialPayout - stake;

    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: {
          lockedBalance: { increment: stake },
        },
      }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          type: "BET_STAKE",
          amount: stake,
          reference: betRequest.id,
          description: `Bet placed at ${requestedOdds > 0 ? "+" : ""}${requestedOdds}`,
        },
      }),
      prisma.bet.create({
        data: {
          betRequestId: betRequest.id,
          userId,
          selectionId,
          odds: requestedOdds,
          stake,
          potentialPayout,
          status: "ACTIVE",
        },
      }),
      prisma.betRequest.update({
        where: { id: betRequest.id },
        data: { status: "CONFIRMED" },
      }),
    ]);

    await incrementExposure(selectionId, liability);
    await incrementDailyStake(userId, stake);
  }

  return NextResponse.json({
    requestId: betRequest.id,
    decision: result.decision,
    requestedOdds,
    acceptedOdds: result.decision !== "REJECT" ? result.acceptedOdds : null,
    potentialPayout: result.decision !== "REJECT" ? result.potentialPayout : null,
    stake,
    rejectReason: result.rejectReason ?? null,
    counterReason: result.counterReason ?? null,
    expiresAt: result.decision === "COUNTER" ? expiresAt.toISOString() : null,
  });
}

// GET /api/bets/request — list user's bet requests
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await prisma.betRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      selection: {
        include: {
          market: {
            include: { event: true },
          },
        },
      },
    },
  });

  return NextResponse.json(requests);
}
