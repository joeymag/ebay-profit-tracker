import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { updateStandardListingPrice } from "@/lib/amazon/reprice/standard";

export async function POST(request: Request) {
  let body: {
    sku?: string;
    price?: number;
    fromPrice?: number | null;
    reason?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON body." }, { status: 400 });
  }

  const sku = body.sku?.trim();
  const price = Number(body.price);
  if (!sku || !(price > 0)) {
    return NextResponse.json(
      { ok: false, error: "sku and a price greater than 0 are required." },
      { status: 400 },
    );
  }

  try {
    const result = await updateStandardListingPrice({
      sku,
      price,
      fromPrice:
        body.fromPrice == null || Number.isNaN(Number(body.fromPrice))
          ? null
          : Number(body.fromPrice),
      reason: body.reason?.trim() || "Manual apply from Standard Amazon repricer",
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
      error instanceof Error ? error.message : "Failed to update Standard price.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
