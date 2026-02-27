import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  return NextResponse.json({
    balance: parseFloat(wallet.balance.toString()),
    lockedBalance: parseFloat(wallet.lockedBalance.toString()),
    available: parseFloat(wallet.balance.toString()) - parseFloat(wallet.lockedBalance.toString()),
  });
}
