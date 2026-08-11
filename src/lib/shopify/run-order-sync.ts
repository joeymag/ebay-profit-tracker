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
import { enrichOrdersWithPostageAndTracking } from "@/lib/shopify/postage-enrichment";
import { getLastOrderSyncCompletedAt } from "@/lib/shopify/sync-state";
import type { StoredOrder } from "@/lib/orders/types";

export type OrderSyncMode = "quick" | "full";

export type RunOrderSyncOptions = {
  mode?: OrderSyncMode;
  /** Only fetch orders updated since last sync (for scheduled runs). */
  incremental?: boolean;
  /** Skip full DB cost recalc (saveOrders already updates imported rows). */
  skipRecalculateCosts?: boolean;
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

  return enrichOrdersWithPostageAndTracking(ordersWithImages, {
    onlyMissingPostage: false,
    concurrency: 8,
  });
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
  } else {
    // Quick + auto-sync: pull Shopify Shipping label costs automatically.
    // Incremental always re-checks fulfilled orders (label may have just been bought).
    // Full-catalog quick sync only looks up orders still missing postage.
    const enriched = await enrichOrdersWithPostageAndTracking(orders, {
      onlyMissingPostage: !incremental,
      concurrency: 8,
    });
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
  const ordersRecalculated =
    options.skipRecalculateCosts || incremental
      ? 0
      : await recalculateAllOrderProductCosts();

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
        ? "Quick sync also pulls Shopify postage label costs for orders still missing postage."
        : incremental
          ? "Auto-sync imports changed Shopify orders and applies postage when a shipping label was purchased."
          : undefined,
  };
}

export function isShopifyApiSyncError(
  error: unknown,
): error is ShopifyApiError {
  return error instanceof ShopifyApiError;
}
