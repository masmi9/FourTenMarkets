import { NextRequest, NextResponse } from "next/server";
import { settleEventSchema } from "@/lib/validators";
import { settleEvent } from "@/lib/settlement-engine";

export async function POST(request: NextRequest) {
  const role = request.headers.get("x-user-role");
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = settleEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { eventId, results } = parsed.data;

  const summary = await settleEvent(eventId, results);

  return NextResponse.json({
    success: true,
    settled: summary.settled,
    totalPaid: summary.totalPaid,
    errors: summary.errors,
  });
}
