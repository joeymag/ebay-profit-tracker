import { NextResponse } from "next/server";

import {
  isShopifyInventoryError,
  lookupAllStockBySku,
} from "@/lib/shopify/inventory";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sku = searchParams.get("sku")?.trim();

  if (!sku) {
    return NextResponse.json(
      { ok: false, error: "SKU is required." },
      { status: 400 },
    );
  }

  try {
    const listings = await lookupAllStockBySku(sku);
    if (listings.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No product found for SKU "${sku}".` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      item: listings[0],
      listings,
    });
  } catch (error) {
    const message = isShopifyInventoryError(error)
      ? error.message
      : "Could not look up SKU.";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
