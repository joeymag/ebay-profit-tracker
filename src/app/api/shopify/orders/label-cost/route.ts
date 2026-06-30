import { NextResponse } from "next/server";

import { fetchOrderShippingLabelCost } from "@/lib/shopify/shipping-labels";
import { getShopifyConfig } from "@/lib/shopify/config";
import { shopifyAdminFetch, ShopifyApiError } from "@/lib/shopify/client";

type OrderEventsResponse = {
  events: Array<{ id: number; verb: string; message: string }>;
};

export async function GET(request: Request) {
  if (!getShopifyConfig().isConfigured) {
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 400 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Pass ?id=shopify_order_id" }, { status: 400 });
  }

  try {
    const { events } = await shopifyAdminFetch<OrderEventsResponse>(
      `/orders/${id}/events.json`,
    );
    const labelEvents = events.filter((e) =>
      e.verb.includes("shipping_label"),
    );
    const cost = await fetchOrderShippingLabelCost(Number(id));

    return NextResponse.json({
      ok: true,
      shopifyOrderId: Number(id),
      shippingLabelCost: cost,
      labelEvents: labelEvents.map((e) => ({
        verb: e.verb,
        message: e.message,
      })),
    });
  } catch (error) {
    if (error instanceof ShopifyApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          hint:
            error.status === 403
              ? "May need read_orders scope (events are under order resource)"
              : undefined,
        },
        { status: 502 },
      );
    }
    throw error;
  }
}
