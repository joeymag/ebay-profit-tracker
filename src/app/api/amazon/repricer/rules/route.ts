import { NextResponse } from "next/server";

import { parseQuantityDiscountPlan, REPRICE_STRATEGIES } from "@/lib/amazon/reprice";
import { upsertBusinessRepriceRule } from "@/lib/amazon/reprice/business";
import { parseRepriceChannel } from "@/lib/amazon/reprice-channel";
import { upsertStandardRepriceRule } from "@/lib/amazon/reprice/standard";
import type { RepriceStrategy } from "@/lib/amazon/reprice/shared/types";

export async function POST(request: Request) {
  let body: {
    sku?: string;
    channel?: string;
    enabled?: boolean;
    strategy?: string;
    minPrice?: number | null;
    maxPrice?: number | null;
    undercutAmount?: number;
    quantityDiscountPlan?: unknown;
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

  const channel = parseRepriceChannel(body.channel) ?? "standard";
  const strategy = (body.strategy || "undercut_buybox") as RepriceStrategy;
  if (!(REPRICE_STRATEGIES as readonly string[]).includes(strategy)) {
    return NextResponse.json({ ok: false, error: "Invalid strategy." }, { status: 400 });
  }

  const base = {
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
        ? 0.01
        : Math.max(0, Number(body.undercutAmount)),
  };

  try {
    if (channel === "business") {
      let quantityDiscountPlan = null;
      if (body.quantityDiscountPlan != null) {
        quantityDiscountPlan = parseQuantityDiscountPlan(body.quantityDiscountPlan);
        if (body.quantityDiscountPlan && !quantityDiscountPlan) {
          return NextResponse.json(
            { ok: false, error: "Invalid quantity discount plan." },
            { status: 400 },
          );
        }
      }
      const rule = await upsertBusinessRepriceRule({
        ...base,
        quantityDiscountPlan,
      });
      return NextResponse.json({ ok: true, rule });
    }

    const rule = await upsertStandardRepriceRule(base);
    return NextResponse.json({ ok: true, rule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save rule.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
