import { markAmazonOrderShipped } from "@/lib/amazon/mark-shipped";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import { markEbayOrderShipped } from "@/lib/ebay/mark-shipped";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";
import { getStoredOrderByShopifyId } from "@/lib/orders/store";
import { fulfillShopifyOrderWithTracking } from "@/lib/shopify/fulfill-order";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const MAX_ORDERS = 20;

type DispatchRow = {
  shopify_id: number;
  ebay_order_id: string | null;
  amazon_order_id: string | null;
  tracking_numbers: string[] | null;
  tracking_url: string | null;
  shipping_carrier: string | null;
  fulfillment_status: string | null;
};

function isFulfilled(status: string | null): boolean {
  return status?.trim().toLowerCase() === "fulfilled";
}

export async function dispatchAfterShopifyLabel(input: {
  shopifyOrderId: number;
  trackingNumber: string;
  trackingUrl?: string | null;
  carrier?: string | null;
}): Promise<{ shopify: string; marketplace: string | null; error?: string }> {
  let shopify = "skipped";
  try {
    shopify = await fulfillShopifyOrderWithTracking({
      shopifyOrderId: input.shopifyOrderId,
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl,
      trackingCompany: input.carrier,
      notifyCustomer: false,
    });
  } catch (error) {
    return {
      shopify: "failed",
      marketplace: null,
      error: error instanceof Error ? error.message : "Could not dispatch Shopify.",
    };
  }

  const order = await getStoredOrderByShopifyId(input.shopifyOrderId);
  if (!order) {
    return { shopify, marketplace: null };
  }

  try {
    if (order.ebayOrderId && (await getStoredEbayRefreshToken())) {
      const result = await markEbayOrderShipped({
        ebayOrderId: order.ebayOrderId,
        trackingNumber: input.trackingNumber,
        carrier: input.carrier ?? order.shippingCarrier,
      });
      return { shopify, marketplace: `eBay ${result}` };
    }
    if (order.amazonOrderId && (await getStoredAmazonRefreshToken())) {
      const result = await markAmazonOrderShipped({
        amazonOrderId: order.amazonOrderId,
        trackingNumber: input.trackingNumber,
        carrier: input.carrier ?? order.shippingCarrier,
      });
      return { shopify, marketplace: `Amazon ${result}` };
    }
  } catch (error) {
    return {
      shopify,
      marketplace: null,
      error:
        error instanceof Error
          ? error.message
          : "Could not mark the marketplace order dispatched.",
    };
  }

  return { shopify, marketplace: null };
}

/** eBay postage already has tracking: mark the Shopify order dispatched. */
export async function dispatchShopifyFromEbayPostage(): Promise<{
  fulfilled: number;
  errors: string[];
}> {
  if (!isSupabaseConfigured() || !(await getStoredEbayRefreshToken())) {
    return { fulfilled: 0, errors: [] };
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "shopify_id, ebay_order_id, amazon_order_id, tracking_numbers, tracking_url, shipping_carrier, fulfillment_status",
    )
    .gte("created_at", since)
    .not("ebay_order_id", "is", null)
    .limit(80);

  if (error || !data) {
    return { fulfilled: 0, errors: [error?.message || "Could not load orders."] };
  }

  let fulfilled = 0;
  const errors: string[] = [];
  const rows = (data as DispatchRow[]).filter(
    (row) =>
      !isFulfilled(row.fulfillment_status) &&
      (row.tracking_numbers ?? []).some((number) => number.trim()),
  );

  for (const row of rows.slice(0, MAX_ORDERS)) {
    const trackingNumber = row.tracking_numbers?.find((number) => number.trim());
    if (!trackingNumber) continue;
    try {
      const result = await fulfillShopifyOrderWithTracking({
        shopifyOrderId: row.shopify_id,
        trackingNumber,
        trackingUrl: row.tracking_url,
        trackingCompany: row.shipping_carrier,
        notifyCustomer: false,
      });
      if (result === "fulfilled") fulfilled += 1;
    } catch (err) {
      errors.push(
        err instanceof Error ? err.message : `Shopify ${row.shopify_id} failed.`,
      );
    }
  }

  return { fulfilled, errors: errors.slice(0, 3) };
}

/** Shopify already has tracking: mark the eBay or Amazon order dispatched. */
export async function pushShopifyTrackingToMarketplaces(): Promise<{
  shipped: number;
  errors: string[];
}> {
  if (!isSupabaseConfigured()) return { shipped: 0, errors: [] };
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "shopify_id, ebay_order_id, amazon_order_id, tracking_numbers, tracking_url, shipping_carrier, fulfillment_status",
    )
    .gte("created_at", since)
    .eq("fulfillment_status", "fulfilled")
    .limit(80);

  if (error || !data) {
    return { shipped: 0, errors: [error?.message || "Could not load orders."] };
  }

  const ebayConnected = Boolean(await getStoredEbayRefreshToken());
  const amazonConnected = Boolean(await getStoredAmazonRefreshToken());
  let shipped = 0;
  const errors: string[] = [];

  for (const row of (data as DispatchRow[]).slice(0, MAX_ORDERS)) {
    const trackingNumber = row.tracking_numbers?.find((number) => number.trim());
    if (!trackingNumber) continue;
    try {
      if (row.ebay_order_id && ebayConnected) {
        const result = await markEbayOrderShipped({
          ebayOrderId: row.ebay_order_id,
          trackingNumber,
          carrier: row.shipping_carrier,
        });
        if (result === "shipped") shipped += 1;
      } else if (row.amazon_order_id && amazonConnected) {
        const result = await markAmazonOrderShipped({
          amazonOrderId: row.amazon_order_id,
          trackingNumber,
          carrier: row.shipping_carrier,
        });
        if (result === "shipped") shipped += 1;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Marketplace dispatch failed.");
    }
  }

  return { shipped, errors: errors.slice(0, 3) };
}
