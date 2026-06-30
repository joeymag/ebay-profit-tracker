import { NextResponse } from "next/server";

import { getSalesChannel } from "@/lib/orders/channel";
import {
  deleteStoredOrder,
  getStoredOrderByShopifyId,
  updateOrderCosts,
} from "@/lib/orders/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type RouteContext = {
  params: Promise<{ shopifyId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { shopifyId: shopifyIdParam } = await context.params;
  const shopifyId = Number(shopifyIdParam);

  if (!Number.isFinite(shopifyId)) {
    return NextResponse.json({ ok: false, error: "Invalid order id." }, { status: 400 });
  }

  const existing = await getStoredOrderByShopifyId(shopifyId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  try {
    const removed = await deleteStoredOrder(shopifyId);
    if (!removed) {
      return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete order";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Order costs require Supabase configuration." },
      { status: 400 },
    );
  }

  const { shopifyId: shopifyIdParam } = await context.params;
  const shopifyId = Number(shopifyIdParam);

  if (!Number.isFinite(shopifyId)) {
    return NextResponse.json({ ok: false, error: "Invalid order id." }, { status: 400 });
  }

  const existing = await getStoredOrderByShopifyId(shopifyId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  const isEbay = getSalesChannel(existing.tags) === "eBay";

  let body: {
    ebayFeeRatePercent?: number | null;
    ebayAdsFeeRatePercent?: number | null;
    shippingLabelCost?: number | null;
    productCost?: number | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !isEbay &&
    (body.ebayFeeRatePercent !== undefined ||
      body.ebayAdsFeeRatePercent !== undefined)
  ) {
    return NextResponse.json(
      { ok: false, error: "eBay fee fields only apply to eBay orders." },
      { status: 400 },
    );
  }

  if (
    body.ebayFeeRatePercent !== null &&
    body.ebayFeeRatePercent !== undefined &&
    (typeof body.ebayFeeRatePercent !== "number" ||
      !Number.isFinite(body.ebayFeeRatePercent) ||
      body.ebayFeeRatePercent < 0 ||
      body.ebayFeeRatePercent > 100)
  ) {
    return NextResponse.json(
      { ok: false, error: "ebayFeeRatePercent must be between 0 and 100." },
      { status: 400 },
    );
  }

  if (
    body.ebayAdsFeeRatePercent !== null &&
    body.ebayAdsFeeRatePercent !== undefined &&
    (typeof body.ebayAdsFeeRatePercent !== "number" ||
      !Number.isFinite(body.ebayAdsFeeRatePercent) ||
      body.ebayAdsFeeRatePercent < 0 ||
      body.ebayAdsFeeRatePercent > 100)
  ) {
    return NextResponse.json(
      { ok: false, error: "ebayAdsFeeRatePercent must be between 0 and 100." },
      { status: 400 },
    );
  }

  if (
    body.shippingLabelCost !== undefined &&
    (typeof body.shippingLabelCost !== "number" ||
      !Number.isFinite(body.shippingLabelCost) ||
      body.shippingLabelCost < 0)
  ) {
    return NextResponse.json(
      { ok: false, error: "shippingLabelCost must be a non-negative number." },
      { status: 400 },
    );
  }

  if (
    body.productCost !== null &&
    body.productCost !== undefined &&
    (typeof body.productCost !== "number" ||
      !Number.isFinite(body.productCost) ||
      body.productCost < 0)
  ) {
    return NextResponse.json(
      { ok: false, error: "productCost must be a non-negative number." },
      { status: 400 },
    );
  }

  try {
    const order = await updateOrderCosts(shopifyId, {
      ...(isEbay
        ? {
            ebayFeeRatePercent: body.ebayFeeRatePercent,
            ebayAdsFeeRatePercent: body.ebayAdsFeeRatePercent,
          }
        : {}),
      shippingLabelCost: body.shippingLabelCost,
      productCost: body.productCost,
    });

    return NextResponse.json({ ok: true, order });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update order costs";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
