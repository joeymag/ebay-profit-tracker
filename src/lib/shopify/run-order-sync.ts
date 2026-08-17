import { isOrderCancelled } from "@/lib/orders/order-status";
import { deleteStoredOrder, getStorageBackend, saveOrders } from "@/lib/orders/store";
import { recalculateAllOrderProductCosts } from "@/lib/orders/apply-product-costs";
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

/** Keep manual quick sync under Vercel/browser timeouts. */
const QUICK_POSTAGE_RECENT_DAYS = 60;
const QUICK_POSTAGE_MAX_LOOKUPS = 20;

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
  labelLookups: number;
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
  let labelLookups = 0;

  if (mode === "full") {
    const enriched = await enrichOrdersForFullSync(orders);
    ordersEnriched = enriched.orders;
    withPostage = enriched.withPostage;
    withTracking = enriched.withTracking;
    labelLookups = enriched.labelLookups;
  } else if (incremental) {
    // Auto-sync: small batch — always check for newly bought labels.
    const enriched = await enrichOrdersWithPostageAndTracking(orders, {
      onlyMissingPostage: false,
      concurrency: 8,
    });
    ordersEnriched = enriched.orders;
    withPostage = enriched.withPostage;
    withTracking = enriched.withTracking;
    labelLookups = enriched.labelLookups;
  } else {
    // Manual quick sync: light postage backfill only (avoids timeouts).
    const enriched = await enrichOrdersWithPostageAndTracking(orders, {
      onlyMissingPostage: true,
      recentDays: QUICK_POSTAGE_RECENT_DAYS,
      maxLabelLookups: QUICK_POSTAGE_MAX_LOOKUPS,
      concurrency: 6,
    });
    ordersEnriched = enriched.orders;
    withPostage = enriched.withPostage;
    withTracking = enriched.withTracking;
    labelLookups = enriched.labelLookups;
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

  const shouldRecalculate =
    !options.skipRecalculateCosts && !incremental && mode === "full";
  const ordersRecalculated = shouldRecalculate
    ? await recalculateAllOrderProductCosts()
    : 0;

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
    productsImported: 0,
    productsTotal: 0,
    ordersWithCostsUpdated: ordersRecalculated,
    removedCancelled,
    updatedSince,
    hint:
      mode === "quick" && !incremental
        ? labelLookups > 0
          ? `Checked ${labelLookups} recent order(s) for Shopify postage labels.`
          : "Quick sync finished. Auto-sync applies postage when new labels are bought."
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
