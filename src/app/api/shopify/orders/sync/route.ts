import { NextResponse } from "next/server";

import { geocodePendingOrders } from "@/lib/geocoding/geocode";
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

export async function POST() {
  const config = getShopifyConfig();

  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Shopify is not configured." },
      { status: 400 },
    );
  }

  try {
    const orders = await fetchAllShopifyOrders();
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

    // Postage: check fulfilled orders + any with fulfillments (label events are per-order)
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

    const productsSync = await syncProductsFromOrders();
    const ordersRecalculated = await recalculateAllOrderProductCosts();
    const geocodeStats = await geocodePendingOrders();

    return NextResponse.json({
      ok: true,
      imported: ordersWithImages.length,
      total: database.orders.length,
      postageLabelsFound: withPostage,
      trackingFound: withTracking,
      syncedAt: database.syncedAt,
      storage: getStorageBackend(),
      productsImported: productsSync.imported,
      productsTotal: productsSync.total,
      ordersWithCostsUpdated: ordersRecalculated,
      geocoded: geocodeStats.geocoded,
      geocodeFailed: geocodeStats.failed,
      removedCancelled,
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
