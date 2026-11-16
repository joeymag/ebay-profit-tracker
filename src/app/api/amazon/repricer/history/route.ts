import { NextResponse } from "next/server";

import { listBusinessRepriceEvents } from "@/lib/amazon/reprice/business";
import { parseRepriceChannel } from "@/lib/amazon/reprice-channel";
import { listStandardRepriceEvents } from "@/lib/amazon/reprice/standard";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") || "7");
  const limit = Number(url.searchParams.get("limit") || "100");
  const sku = url.searchParams.get("sku")?.trim() || undefined;
  const channel = parseRepriceChannel(url.searchParams.get("channel")) ?? "standard";

  try {
    const options = {
      days: Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 7,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100,
      sku,
    };
    const events =
      channel === "business"
        ? await listBusinessRepriceEvents(options)
        : await listStandardRepriceEvents(options);
    return NextResponse.json({
      ok: true,
      channel,
      days: options.days,
      count: events.length,
      events,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load reprice history.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
