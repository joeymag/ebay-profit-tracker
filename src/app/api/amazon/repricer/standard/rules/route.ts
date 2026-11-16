import { NextResponse } from "next/server";

import { REPRICE_STRATEGIES } from "@/lib/amazon/reprice";
import { upsertStandardRepriceRule } from "@/lib/amazon/reprice/standard";
import type { RepriceStrategy } from "@/lib/amazon/reprice/shared/types";

export async function POST(request: Request) {
  let body: {
    sku?: string;
    enabled?: boolean;
    strategy?: string;
    minPrice?: number | null;
    maxPrice?: number | null;
    undercutAmount?: number;
    gapOffsetAmount?: number;
    gapOffsetPercent?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON body." }, { status: 400 });
  }

  const sku = body.sku?.trim();
  if (!sku) {
    return NextResponse.json({ ok: false, error: "sku is required." }, { status: 400 });
  }

  const strategy = (body.strategy || "undercut_buybox") as RepriceStrategy;
  if (!(REPRICE_STRATEGIES as readonly string[]).includes(strategy)) {
    return NextResponse.json({ ok: false, error: "Invalid strategy." }, { status: 400 });
  }

  try {
    const rule = await upsertStandardRepriceRule({
      sku,
      enabled: body.enabled !== false,
      strategy,
      minPrice:
        body.minPrice == null || Number.isNaN(Number(body.minPrice))
          ? null
          : Number(body.minPrice),
      maxPrice:
        body.maxPrice == null || Number.isNaN(Number(body.maxPrice))
          ? null
          : Number(body.maxPrice),
      undercutAmount:
        body.undercutAmount == null || Number.isNaN(Number(body.undercutAmount))
          ? 0.1
          : Math.max(0, Number(body.undercutAmount)),
      gapOffsetAmount:
        body.gapOffsetAmount == null || Number.isNaN(Number(body.gapOffsetAmount))
          ? 0
          : Number(body.gapOffsetAmount),
      gapOffsetPercent:
        body.gapOffsetPercent == null ||
        Number.isNaN(Number(body.gapOffsetPercent))
          ? 0
          : Number(body.gapOffsetPercent),
    });
    return NextResponse.json({ ok: true, rule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save rule.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
