import { NextResponse } from "next/server";

import { listRepriceEvents } from "@/lib/amazon/repricer";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") || "7");
  const limit = Number(url.searchParams.get("limit") || "100");
  const sku = url.searchParams.get("sku")?.trim() || undefined;

  try {
    const events = await listRepriceEvents({
      days: Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 7,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100,
      sku,
    });
    return NextResponse.json({
      ok: true,
      days: Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 7,
      count: events.length,
      events,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load reprice history.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
