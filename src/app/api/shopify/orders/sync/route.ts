import { NextResponse } from "next/server";

import { withComputedFinancials } from "@/lib/orders/financials";
import { isOrderCancelled } from "@/lib/orders/order-status";
import { deleteStoredOrder, getStorageBackend, saveOrders } from "@/lib/orders/store";
import { ShopifyApiError } from "@/lib/shopify/client";
import { fetchAllShopifyOrders } from "@/lib/shopify/orders";
import { enrichOrdersWithLineItemImages } from "@/lib/shopify/line-item-images";
import { syncProductsFromOrders } from "@/lib/products/store";
import { recalculateAllOrderProductCosts } from "@/lib/orders/apply-product-costs";
import { fetchFulfillmentsForOrders } from "@/lib/shopify/fulfillments";
import { enrichStoredOrderWithFulfillments } from "@/lib/shopify/shipping";
import { fetchShippingLabelCostsForOrders } from "@/lib/shopify/shipping-labels";
import { getShopifyConfig } from "@/lib/shopify/config";
import type { StoredOrder } from "@/lib/orders/types";

/** Vercel Pro allows up to 300s; full sync can still exceed Hobby limits. */
export const maxDuration = 300;

type SyncMode = "quick" | "full";

function parseSyncMode(request: Request): SyncMode {
  const url = new URL(request.url);
  return url.searchParams.get("mode") === "full" ? "full" : "quick";
}

async function enrichOrdersForFullSync(orders: StoredOrder[]): Promise<{
  orders: StoredOrder[];
  withPostage: number;
  withTracking: number;
}> {
  const ordersWithImages = await enrichOrdersWithLineItemImages(orders, {
    concurrency: 5,
  });

  const fulfilledIds = ordersWithImages
    .filter(
      (o) =>
        o.fulfillmentStatus === "fulfilled" ||
        o.fulfillmentStatus === "partial",
    )
    .map((o) => o.shopifyId);

  const fulfillmentsMap = await fetchFulfillmentsForOrders(fulfilledIds, {
    concurrency: 8,
  });

  const labelLookupIds = [
    ...new Set([...fulfilledIds, ...fulfillmentsMap.keys()]),
  ];

  const labelCosts = await fetchShippingLabelCostsForOrders(labelLookupIds, {
    concurrency: 3,
  });

  const ordersEnriched = ordersWithImages.map((order) => {
    const fulfillmentData = fulfillmentsMap.get(order.shopifyId);
    const fulfillments = fulfillmentData?.fulfillments;
    let next = order;
    if (fulfillments?.length) {
      next = enrichStoredOrderWithFulfillments(
        order,
        fulfillments,
        fulfillmentData?.deliveredAt ?? null,
      );
    }
    const labelCost = labelCosts.get(order.shopifyId);
    if (labelCost != null) {
      next = withComputedFinancials({
        ...next,
        shippingLabelCost: labelCost,
      });
    }
    return next;
  });

  const withPostage = ordersEnriched.filter(
    (o) => o.shippingLabelCost != null && o.shippingLabelCost > 0,
  ).length;
  const withTracking = ordersEnriched.filter(
    (o) => o.trackingNumbers.length > 0,
  ).length;

  return { orders: ordersEnriched, withPostage, withTracking };
}

export async function POST(request: Request) {
  const config = getShopifyConfig();
  const mode = parseSyncMode(request);

  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Shopify is not configured." },
      { status: 400 },
    );
  }

  try {
    const orders = await fetchAllShopifyOrders();

    let ordersEnriched = orders;
    let withPostage = 0;
    let withTracking = orders.filter((o) => o.trackingNumbers.length > 0).length;

    if (mode === "full") {
      const enriched = await enrichOrdersForFullSync(orders);
      ordersEnriched = enriched.orders;
      withPostage = enriched.withPostage;
      withTracking = enriched.withTracking;
    }

    let removedCancelled = 0;
    for (const order of ordersEnriched) {
      if (isOrderCancelled(order)) {
        const removed = await deleteStoredOrder(order.shopifyId);
        if (removed) {
          removedCancelled += 1;
        }
      }
    }

    const activeOrders = ordersEnriched.filter(
      (order) => !isOrderCancelled(order),
    );

    const syncedAt = new Date().toISOString();
    const database = await saveOrders(activeOrders, syncedAt, {
      postageLabelsFound: withPostage,
      trackingFound: withTracking,
    });

    const productsSync =
      mode === "full" ? await syncProductsFromOrders() : null;
    const ordersRecalculated = await recalculateAllOrderProductCosts();

    return NextResponse.json({
      ok: true,
      mode,
      imported: orders.length,
      total: database.orders.length,
      postageLabelsFound: withPostage,
      trackingFound: withTracking,
      syncedAt: database.syncedAt,
      storage: getStorageBackend(),
      productsImported: productsSync?.imported ?? 0,
      productsTotal: productsSync?.total ?? 0,
      ordersWithCostsUpdated: ordersRecalculated,
      removedCancelled,
      hint:
        mode === "quick"
          ? "Quick sync updates order fields (e.g. eBay order IDs). Run full sync locally for postage labels and images."
          : undefined,
    });
  } catch (error) {
    if (error instanceof ShopifyApiError) {
      let hint: string | undefined;
      if (error.status === 403) {
        hint =
          "Add Admin API scope read_orders (not customer_read_orders). Release the app version, reinstall on your store, then sync again. If you created a new app, update SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env.local.";
      }

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          status: error.status,
          hint,
          details: error.body?.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to sync orders";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
