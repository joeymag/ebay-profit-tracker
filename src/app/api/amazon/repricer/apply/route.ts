import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import {
  parseQuantityDiscountPlan,
  parseRepriceChannel,
  type AmazonRepriceChannel,
} from "@/lib/amazon/reprice-channel";
import { updateAmazonListingPrice } from "@/lib/amazon/repricer";

export async function POST(request: Request) {
  let body: {
    sku?: string;
    channel?: string;
    price?: number;
    fromPrice?: number | null;
    reason?: string;
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
  const price = Number(body.price);
  const channel: AmazonRepriceChannel =
    parseRepriceChannel(body.channel) ?? "standard";

  if (!sku || !(price > 0)) {
    return NextResponse.json(
      { ok: false, error: "sku and a price greater than 0 are required." },
      { status: 400 },
    );
  }

  const quantityDiscountPlan =
    channel === "business"
      ? parseQuantityDiscountPlan(body.quantityDiscountPlan)
      : null;

  try {
    const result = await updateAmazonListingPrice({
      sku,
      channel,
      price,
      quantityDiscountPlan,
      fromPrice:
        body.fromPrice == null || Number.isNaN(Number(body.fromPrice))
          ? null
          : Number(body.fromPrice),
      reason:
        body.reason?.trim() ||
        (channel === "business"
          ? "Manual apply from Amazon Business repricer"
          : "Manual apply from Amazon repricer"),
      source: "manual",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        { ok: false, error: error.message, details: error.body.slice(0, 500) },
        { status: 502 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to update Amazon price.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
