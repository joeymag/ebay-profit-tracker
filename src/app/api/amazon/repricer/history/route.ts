import { NextResponse } from "next/server";

import { parseRepriceChannel } from "@/lib/amazon/reprice-channel";
import { listRepriceEvents } from "@/lib/amazon/repricer";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") || "7");
  const limit = Number(url.searchParams.get("limit") || "100");
  const sku = url.searchParams.get("sku")?.trim() || undefined;
  const channel = parseRepriceChannel(url.searchParams.get("channel")) ?? undefined;

  try {
    const events = await listRepriceEvents({
      days: Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 7,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100,
      sku,
      channel,
    });
    return NextResponse.json({
      ok: true,
      channel: channel ?? null,
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
