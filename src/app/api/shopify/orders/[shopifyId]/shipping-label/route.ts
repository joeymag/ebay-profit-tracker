import { NextResponse } from "next/server";

import { getShopifyConfig, getShopifyOrderAdminUrl } from "@/lib/shopify/config";
import {
  getLabelFulfillmentOrders,
  SHOPIFY_SHIPPING_LABEL_API_VERSION,
} from "@/lib/shopify/shipping-label-purchase";

type RouteContext = {
  params: Promise<{ shopifyId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const config = getShopifyConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Shopify is not configured." },
      { status: 400 },
    );
  }

  const { shopifyId: rawId } = await context.params;
  const shopifyId = Number(rawId);
  if (!Number.isFinite(shopifyId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid Shopify order id." },
      { status: 400 },
    );
  }

  try {
    const result = await getLabelFulfillmentOrders(shopifyId);
    return NextResponse.json({
      ok: true,
      shopifyId,
      apiVersion: SHOPIFY_SHIPPING_LABEL_API_VERSION,
      orderName: result.orderName,
      fulfillmentStatus: result.fulfillmentStatus,
      fulfillmentOrders: result.fulfillmentOrders,
      shopifyAdminUrl: getShopifyOrderAdminUrl(shopifyId),
      requiredScopes: [
        "write_orders",
        "write_merchant_managed_fulfillment_orders",
      ],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load fulfillment orders";
    const needsScope =
      /access denied|scope|permission|buy_shipping_labels/i.test(message);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint: needsScope
          ? "Add Admin API scopes write_orders and write_merchant_managed_fulfillment_orders, release/reinstall the app, and ensure Shopify Shipping is enabled with buy_shipping_labels permission."
          : undefined,
      },
      { status: 502 },
    );
  }
}
