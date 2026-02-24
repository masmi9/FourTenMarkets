import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis, redisKeys } from "@/lib/redis";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = request.headers.get("x-user-role");
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { status?: "OPEN" | "SUSPENDED" | "CLOSED" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { status } = body;
  if (!status || !["OPEN", "SUSPENDED", "CLOSED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const market = await prisma.market.update({
    where: { id },
    data: { status },
  });

  // Cache market status in Redis
  await redis.set(redisKeys.marketStatus(id), status, "EX", 300);

  return NextResponse.json({ id: market.id, status: market.status });
}
