/**
 * POST /api/admin/auto-settle
 *
 * Admin-triggered settlement run — delegates to the shared runAutoSettle()
 * helper so the logic stays in one place and is also available to the
 * background scheduler that starts automatically on server boot.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAutoSettle } from "@/lib/auto-settle";

export async function POST(request: NextRequest) {
  const role = request.headers.get("x-user-role");
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runAutoSettle();

  if (result.settled === 0 && result.skipped === 0 && result.errors.length === 0) {
    return NextResponse.json({
      ...result,
      message: "No completed games to settle",
    });
  }

  return NextResponse.json(result);
}
