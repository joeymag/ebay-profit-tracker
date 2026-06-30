import { NextResponse } from "next/server";

import { ShopifyApiError } from "@/lib/shopify/client";
import { getShopifyOrderSample } from "@/lib/shopify/order-sample";
import { getShopifyConfig } from "@/lib/shopify/config";

export async function GET() {
  if (!getShopifyConfig().isConfigured) {
    return NextResponse.json({ ok: false, error: "Shopify not configured" }, { status: 400 });
  }

  try {
    const sample = await getShopifyOrderSample();
    if (!sample) {
      return NextResponse.json({ ok: false, error: "No orders in store" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...sample });
  } catch (error) {
    if (error instanceof ShopifyApiError) {
      return NextResponse.json(
        { ok: false, error: error.message, details: error.body?.slice(0, 500) },
        { status: 502 },
      );
    }
    throw error;
  }
}
