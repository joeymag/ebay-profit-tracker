import { NextResponse } from "next/server";

import { shopifyAdminFetch, ShopifyApiError } from "@/lib/shopify/client";
import type { ShopifyOrder } from "@/lib/shopify/types";
import { getShopifyConfig } from "@/lib/shopify/config";

type SingleOrderResponse = { order: ShopifyOrder };

export async function GET(request: Request) {
  if (!getShopifyConfig().isConfigured) {
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 400 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Pass ?id=" }, { status: 400 });
  }

  try {
    const { order } = await shopifyAdminFetch<SingleOrderResponse>(
      `/orders/${id}.json`,
    );

    return NextResponse.json({
      ok: true,
      name: order.name,
      fulfillment_status: order.fulfillment_status,
      shipping_lines: order.shipping_lines,
      fulfillments: order.fulfillments,
    });
  } catch (error) {
    if (error instanceof ShopifyApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    }
    throw error;
  }
}
