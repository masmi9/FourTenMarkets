import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const sports = await prisma.sport.findMany({
    include: { leagues: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(sports);
}
