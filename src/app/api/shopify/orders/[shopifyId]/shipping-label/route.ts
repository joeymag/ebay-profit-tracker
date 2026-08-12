import { NextResponse } from "next/server";

import { getStoredOrderByShopifyId } from "@/lib/orders/store";
import { getShopifyConfig, getShopifyCreateShippingLabelUrl, getShopifyOrderAdminUrl } from "@/lib/shopify/config";
import {
  getLabelFulfillmentOrders,
  getShopifyShippingLabelById,
  SHOPIFY_SHIPPING_LABEL_API_VERSION,
  type PurchasedShippingLabel,
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
    const [result, storedOrder] = await Promise.all([
      getLabelFulfillmentOrders(shopifyId),
      getStoredOrderByShopifyId(shopifyId),
    ]);

    let purchasedLabel: PurchasedShippingLabel | null = null;
    const storedGid = storedOrder?.shippingLabelGid?.trim();
    if (storedGid) {
      try {
        purchasedLabel = await getShopifyShippingLabelById(storedGid);
      } catch {
        purchasedLabel = {
          id: storedGid,
          trackingNumber: storedOrder?.trackingNumbers?.[0] ?? null,
          trackingUrl: storedOrder?.trackingUrl ?? null,
          documentUrl: null,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      shopifyId,
      apiVersion: SHOPIFY_SHIPPING_LABEL_API_VERSION,
      orderName: result.orderName,
      fulfillmentStatus: result.fulfillmentStatus,
      fulfillmentOrders: result.fulfillmentOrders,
      purchasedLabel,
      shippingLabelGid: storedGid ?? null,
      shopifyAdminUrl: getShopifyOrderAdminUrl(shopifyId),
      shopifyCreateLabelUrl: getShopifyCreateShippingLabelUrl(shopifyId),
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
