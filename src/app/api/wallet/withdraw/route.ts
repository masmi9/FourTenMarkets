import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withdrawSchema } from "@/lib/validators";

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

  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { amount } = parsed.data;

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const available =
    parseFloat(wallet.balance.toString()) -
    parseFloat(wallet.lockedBalance.toString());

  if (amount > available) {
    return NextResponse.json(
      { error: `Insufficient available balance. Available: $${available.toFixed(2)}` },
      { status: 400 }
    );
  }

  const [updatedWallet] = await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: "WITHDRAWAL",
        amount,
        description: `Withdrawal of $${amount.toFixed(2)}`,
      },
    }),
  ]);

  return NextResponse.json({
    balance: parseFloat(updatedWallet.balance.toString()),
    withdrawn: amount,
  });
}
