import { NextResponse } from "next/server";

import {
  parseQuantityDiscountPlan,
  parseRepriceChannel,
  type AmazonRepriceChannel,
} from "@/lib/amazon/reprice-channel";
import {
  upsertRepriceRule,
  type RepriceStrategy,
} from "@/lib/amazon/repricer";

const STRATEGIES = new Set<RepriceStrategy>([
  "manual",
  "match_buybox",
  "match_lowest",
  "undercut_lowest",
  "undercut_buybox",
]);

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
    return NextResponse.json(
      { ok: false, error: "Expected JSON body." },
      { status: 400 },
    );
  }

  const sku = body.sku?.trim();
  if (!sku) {
    return NextResponse.json(
      { ok: false, error: "sku is required." },
      { status: 400 },
    );
  }

  const channel: AmazonRepriceChannel =
    parseRepriceChannel(body.channel) ?? "standard";

  const strategy = (body.strategy || "undercut_buybox") as RepriceStrategy;
  if (!STRATEGIES.has(strategy)) {
    return NextResponse.json(
      { ok: false, error: "Invalid strategy." },
      { status: 400 },
    );
  }

  let quantityDiscountPlan = null;
  if (channel === "business" && body.quantityDiscountPlan != null) {
    quantityDiscountPlan = parseQuantityDiscountPlan(body.quantityDiscountPlan);
    if (body.quantityDiscountPlan && !quantityDiscountPlan) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid quantity discount plan. Use discountType fixed|percent and up to 5 levels.",
        },
        { status: 400 },
      );
    }
  }

  try {
    const rule = await upsertRepriceRule({
      sku,
      channel,
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
      quantityDiscountPlan:
        channel === "business" ? quantityDiscountPlan : null,
    });
    return NextResponse.json({ ok: true, rule });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save rule.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
