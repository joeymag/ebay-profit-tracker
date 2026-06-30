import { isOrderCancelled } from "@/lib/orders/order-status";
import { deleteStoredOrder, getStorageBackend, saveOrders } from "@/lib/orders/store";
import { recalculateAllOrderProductCosts } from "@/lib/orders/apply-product-costs";
import { syncProductsFromOrders } from "@/lib/products/store";
import { ShopifyApiError } from "@/lib/shopify/client";
import {
  fetchAllShopifyOrders,
  fetchShopifyOrdersUpdatedSince,
} from "@/lib/shopify/orders";
import { enrichOrdersWithLineItemImages } from "@/lib/shopify/line-item-images";
import { fetchFulfillmentsForOrders } from "@/lib/shopify/fulfillments";
import { enrichStoredOrderWithFulfillments } from "@/lib/shopify/shipping";
import { fetchShippingLabelCostsForOrders } from "@/lib/shopify/shipping-labels";
import { withComputedFinancials } from "@/lib/orders/financials";
import { getLastOrderSyncCompletedAt } from "@/lib/shopify/sync-state";
import type { StoredOrder } from "@/lib/orders/types";

export type OrderSyncMode = "quick" | "full";

export type RunOrderSyncOptions = {
  mode?: OrderSyncMode;
  /** Only fetch orders updated since last sync (for scheduled runs). */
  incremental?: boolean;
};

export type RunOrderSyncResult = {
  ok: true;
  mode: OrderSyncMode;
  incremental: boolean;
  imported: number;
  total: number;
  postageLabelsFound: number;
  trackingFound: number;
  syncedAt: string | null;
  storage: string;
  productsImported: number;
  productsTotal: number;
  ordersWithCostsUpdated: number;
  removedCancelled: number;
  updatedSince?: string;
  hint?: string;
};

const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const SYNC_OVERLAP_MS = 10 * 60 * 1000;

export function resolveIncrementalSince(lastSyncAt: string | null): string {
  if (lastSyncAt) {
    return new Date(new Date(lastSyncAt).getTime() - SYNC_OVERLAP_MS).toISOString();
  }

  return new Date(Date.now() - DEFAULT_LOOKBACK_MS).toISOString();
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

export async function runOrderSync(
  options: RunOrderSyncOptions = {},
): Promise<RunOrderSyncResult> {
  const mode = options.mode ?? "quick";
  const incremental = options.incremental ?? false;

  let updatedSince: string | undefined;
  let orders: StoredOrder[];

  if (incremental) {
    const lastSyncAt = await getLastOrderSyncCompletedAt();
    updatedSince = resolveIncrementalSince(lastSyncAt);
    orders = await fetchShopifyOrdersUpdatedSince(updatedSince);
  } else {
    orders = await fetchAllShopifyOrders();
  }

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

  const activeOrders = ordersEnriched.filter((order) => !isOrderCancelled(order));

  const syncedAt = new Date().toISOString();
  const database = await saveOrders(activeOrders, syncedAt, {
    postageLabelsFound: withPostage,
    trackingFound: withTracking,
  });

  const productsSync = mode === "full" ? await syncProductsFromOrders() : null;
  const ordersRecalculated = await recalculateAllOrderProductCosts();

  return {
    ok: true,
    mode,
    incremental,
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
    updatedSince,
    hint:
      mode === "quick" && !incremental
        ? "Quick sync updates order fields (e.g. eBay order IDs). Run full sync locally for postage labels and images."
        : incremental
          ? "Auto-sync imported orders changed in Shopify since the last run (includes new eBay orders)."
          : undefined,
  };
}

export function isShopifyApiSyncError(
  error: unknown,
): error is ShopifyApiError {
  return error instanceof ShopifyApiError;
}
