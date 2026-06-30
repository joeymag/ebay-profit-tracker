import fs from "fs/promises";
import path from "path";

import { applyProductCostsToOrder, applyProductCostsToOrders } from "@/lib/orders/apply-product-costs";
import {
  applySkuCostDefaultsToOrder,
  buildSkuCostDefaultsFromOrders,
} from "@/lib/orders/sku-cost-defaults";
import { parseEbayUsernameForOrder } from "@/lib/orders/ebay-buyer";
import { withComputedFinancials } from "@/lib/orders/financials";
import {
  excludeDeletedOrders,
  getDeletedOrderIds,
  markOrderDeleted,
} from "@/lib/orders/deleted-orders";
import {
  deleteOrderFromSupabase,
  getOrdersFromSupabase,
  saveOrdersToSupabase,
  updateOrderCostsInSupabase,
} from "@/lib/orders/supabase-store";
import type { OrdersDatabase, StoredOrder } from "@/lib/orders/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const DATA_DIR = path.join(process.cwd(), "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

const emptyDatabase = (): OrdersDatabase => ({
  syncedAt: null,
  orders: [],
});

/** Migrate legacy `shipping` field to `shippingCharged`. */
function normalizeLegacyOrder(order: StoredOrder & { shipping?: number }): StoredOrder {
  if (
    order.shippingCharged == null &&
    typeof order.shipping === "number"
  ) {
    order.shippingCharged = order.shipping;
  }
  if (order.shippingLabelCost === undefined) {
    order.shippingLabelCost = null;
  }
  if (order.productCost === undefined) {
    order.productCost = null;
  }
  if (order.productCostManual === undefined) {
    order.productCostManual = false;
  }
  if (order.cancelledAt === undefined) {
    order.cancelledAt = null;
  }
  if (order.tags === undefined) {
    order.tags = null;
  }
  if (order.shippingCarrier === undefined) {
    order.shippingCarrier = null;
  }
  if (order.shippingService === undefined) {
    order.shippingService = null;
  }
  if (order.trackingNumbers === undefined) {
    order.trackingNumbers = [];
  }
  if (order.trackingUrl === undefined) {
    order.trackingUrl = null;
  }
  if (order.shipmentStatus === undefined) {
    order.shipmentStatus = null;
  }
  if (order.buyerName === undefined) {
    order.buyerName = null;
  }
  if (order.ebayUsername === undefined) {
    order.ebayUsername = parseEbayUsernameForOrder({
      buyerName: order.buyerName,
      tags: order.tags ?? null,
    });
  }
  if (order.ebayOrderId === undefined) {
    order.ebayOrderId = null;
  }
  if (order.amazonOrderId === undefined) {
    order.amazonOrderId = null;
  }
  if (order.amazonDeliverByAt === undefined) {
    order.amazonDeliverByAt = null;
  }
  if (order.ebayDeliverByAt === undefined) {
    order.ebayDeliverByAt = null;
  }
  if (order.shippingAddress === undefined) {
    order.shippingAddress = null;
  }
  if (order.latitude === undefined) {
    order.latitude = null;
  }
  if (order.longitude === undefined) {
    order.longitude = null;
  }
  if (order.geocodeRegion === undefined) {
    order.geocodeRegion = null;
  }
  if (order.geocodedAt === undefined) {
    order.geocodedAt = null;
  }
  if (order.deliveredAt === undefined) {
    order.deliveredAt = null;
  }
  if (order.platformFee === undefined) {
    order.platformFee = null;
  }
  if (order.ebayFeeRate === undefined) {
    order.ebayFeeRate = null;
  }
  if (order.ebayAdsFeeRate === undefined) {
    order.ebayAdsFeeRate = null;
  }
  if (order.ebayFeesActual === undefined) {
    order.ebayFeesActual = null;
  }
  if (order.ebayAdsFeeActual === undefined) {
    order.ebayAdsFeeActual = null;
  }
  if (order.ebayFeesSyncedAt === undefined) {
    order.ebayFeesSyncedAt = null;
  }
  for (const item of order.lineItems ?? []) {
    if (item.productId === undefined) {
      item.productId = null;
    }
    if (item.variantId === undefined) {
      item.variantId = null;
    }
    if (item.imageUrl === undefined) {
      item.imageUrl = null;
    }
    if (item.unitCost === undefined) {
      item.unitCost = null;
    }
  }
  return order as StoredOrder;
}

async function readOrdersFromJson(): Promise<OrdersDatabase> {
  try {
    const raw = await fs.readFile(ORDERS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as OrdersDatabase;
    return {
      ...parsed,
      orders: parsed.orders.map((o) =>
        withComputedFinancials(
          normalizeLegacyOrder(o as StoredOrder & { shipping?: number }),
        ),
      ),
    };
  } catch {
    return emptyDatabase();
  }
}

async function saveOrdersToJson(
  orders: StoredOrder[],
  syncedAt: string,
): Promise<OrdersDatabase> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const deletedIds = await getDeletedOrderIds();
  const importableOrders = orders.filter(
    (order) => !deletedIds.has(order.shopifyId),
  );

  const existing = await readOrdersFromJson();
  const byId = new Map(existing.orders.map((o) => [o.shopifyId, o]));
  const skuDefaults = buildSkuCostDefaultsFromOrders([
    ...existing.orders,
    ...importableOrders,
  ]);

  for (const order of importableOrders) {
    const previous = byId.get(order.shopifyId);
    const merged: StoredOrder = withComputedFinancials(
      applySkuCostDefaultsToOrder(
        {
          ...order,
          tags: order.tags ?? previous?.tags ?? null,
          productCost: previous?.productCost ?? order.productCost,
          productCostManual:
            previous?.productCostManual ?? order.productCostManual ?? false,
          ebayFeeRate: previous?.ebayFeeRate ?? order.ebayFeeRate ?? null,
          ebayAdsFeeRate:
            previous?.ebayAdsFeeRate ?? order.ebayAdsFeeRate ?? null,
          ebayFeesActual:
            previous?.ebayFeesActual ?? order.ebayFeesActual ?? null,
          ebayAdsFeeActual:
            previous?.ebayAdsFeeActual ?? order.ebayAdsFeeActual ?? null,
          ebayFeesSyncedAt:
            previous?.ebayFeesSyncedAt ?? order.ebayFeesSyncedAt ?? null,
          shippingLabelCost:
            order.shippingLabelCost ?? previous?.shippingLabelCost ?? null,
        },
        skuDefaults,
      ),
    );
    byId.set(order.shopifyId, merged);
  }

  const merged = [...byId.values()].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const database: OrdersDatabase = {
    syncedAt,
    orders: merged,
  };

  await fs.writeFile(ORDERS_FILE, JSON.stringify(database, null, 2), "utf-8");
  return database;
}

export async function getStoredOrders(): Promise<OrdersDatabase> {
  if (isSupabaseConfigured()) {
    return getOrdersFromSupabase();
  }
  const deletedIds = await getDeletedOrderIds();
  const database = await readOrdersFromJson();
  const visibleOrders = excludeDeletedOrders(database.orders, deletedIds);
  return {
    ...database,
    orders: await applyProductCostsToOrders(visibleOrders),
  };
}

export async function deleteStoredOrder(shopifyId: number): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return deleteOrderFromSupabase(shopifyId);
  }

  const database = await readOrdersFromJson();
  const exists = database.orders.some((order) => order.shopifyId === shopifyId);
  if (!exists) {
    return false;
  }

  const orders = database.orders.filter(
    (order) => order.shopifyId !== shopifyId,
  );

  await fs.writeFile(
    ORDERS_FILE,
    JSON.stringify({ ...database, orders }, null, 2),
    "utf-8",
  );
  await markOrderDeleted(shopifyId);
  return true;
}

export async function getStoredOrderByShopifyId(
  shopifyId: number,
): Promise<StoredOrder | null> {
  if (isSupabaseConfigured()) {
    const { getOrderFromSupabase } = await import("@/lib/orders/supabase-store");
    return getOrderFromSupabase(shopifyId);
  }
  const database = await readOrdersFromJson();
  const order = database.orders.find((o) => o.shopifyId === shopifyId);
  return order ? applyProductCostsToOrder(order) : null;
}

export async function readOrdersDatabase(): Promise<OrdersDatabase> {
  return getStoredOrders();
}

export async function saveOrders(
  orders: StoredOrder[],
  syncedAt: string,
  stats?: { postageLabelsFound: number; trackingFound: number },
): Promise<OrdersDatabase> {
  if (isSupabaseConfigured()) {
    return saveOrdersToSupabase(orders, syncedAt, stats);
  }
  return saveOrdersToJson(orders, syncedAt);
}

export function getStorageBackend(): "supabase" | "json" {
  return isSupabaseConfigured() ? "supabase" : "json";
}

export async function updateOrderCosts(
  shopifyId: number,
  updates: {
    ebayFeeRatePercent?: number | null;
    ebayAdsFeeRatePercent?: number | null;
    shippingLabelCost?: number | null;
    productCost?: number | null;
  },
): Promise<StoredOrder | null> {
  const ebayFeeRate =
    updates.ebayFeeRatePercent === undefined
      ? undefined
      : updates.ebayFeeRatePercent == null
        ? null
        : updates.ebayFeeRatePercent / 100;

  const ebayAdsFeeRate =
    updates.ebayAdsFeeRatePercent === undefined
      ? undefined
      : updates.ebayAdsFeeRatePercent == null
        ? null
        : updates.ebayAdsFeeRatePercent / 100;

  const productCostManual =
    updates.productCost !== undefined
      ? updates.productCost != null
      : undefined;

  if (isSupabaseConfigured()) {
    return updateOrderCostsInSupabase(shopifyId, {
      ebayFeeRate,
      ebayAdsFeeRate,
      shippingLabelCost: updates.shippingLabelCost,
      productCost: updates.productCost,
      productCostManual,
    });
  }

  const database = await readOrdersFromJson();
  const existing = database.orders.find((order) => order.shopifyId === shopifyId);
  if (!existing) {
    return null;
  }

  const updated = await applyProductCostsToOrder({
    ...existing,
    ebayFeeRate:
      ebayFeeRate !== undefined ? ebayFeeRate : existing.ebayFeeRate,
    ebayAdsFeeRate:
      ebayAdsFeeRate !== undefined ? ebayAdsFeeRate : existing.ebayAdsFeeRate,
    shippingLabelCost:
      updates.shippingLabelCost !== undefined
        ? updates.shippingLabelCost
        : existing.shippingLabelCost,
    productCost:
      updates.productCost !== undefined
        ? updates.productCost
        : existing.productCost,
    productCostManual:
      productCostManual !== undefined
        ? productCostManual
        : existing.productCostManual,
  });

  const orders = database.orders.map((order) =>
    order.shopifyId === shopifyId ? updated : order,
  );

  await fs.writeFile(
    ORDERS_FILE,
    JSON.stringify({ ...database, orders }, null, 2),
    "utf-8",
  );

  return updated;
}

export type BulkCostUpdateEntry = {
  shopifyId: number;
  orderNumber: string;
  reason?: string;
  error?: string;
};

export type BulkCostUpdateResult = {
  updatedCount: number;
  skipped: BulkCostUpdateEntry[];
  failed: BulkCostUpdateEntry[];
};

export async function bulkUpdateOrderCosts(
  shopifyIds: number[],
  updates: {
    ebayFeeRatePercent?: number;
    ebayAdsFeeRatePercent?: number;
    shippingLabelCost?: number;
    productCost?: number;
  },
): Promise<BulkCostUpdateResult> {
  const { getSalesChannel } = await import("@/lib/orders/channel");
  const skipped: BulkCostUpdateEntry[] = [];
  const failed: BulkCostUpdateEntry[] = [];
  let updatedCount = 0;

  const hasEbayFeeUpdate =
    updates.ebayFeeRatePercent !== undefined ||
    updates.ebayAdsFeeRatePercent !== undefined;

  for (const shopifyId of shopifyIds) {
    const existing = await getStoredOrderByShopifyId(shopifyId);
    if (!existing) {
      failed.push({
        shopifyId,
        orderNumber: String(shopifyId),
        error: "Order not found",
      });
      continue;
    }

    const isEbay = getSalesChannel(existing.tags) === "eBay";
    const patch: Parameters<typeof updateOrderCosts>[1] = {};

    if (updates.shippingLabelCost !== undefined) {
      patch.shippingLabelCost = updates.shippingLabelCost;
    }
    if (updates.productCost !== undefined) {
      patch.productCost = updates.productCost;
    }
    if (isEbay) {
      if (updates.ebayFeeRatePercent !== undefined) {
        patch.ebayFeeRatePercent = updates.ebayFeeRatePercent;
      }
      if (updates.ebayAdsFeeRatePercent !== undefined) {
        patch.ebayAdsFeeRatePercent = updates.ebayAdsFeeRatePercent;
      }
    }

    if (Object.keys(patch).length === 0) {
      skipped.push({
        shopifyId,
        orderNumber: existing.orderNumber,
        reason: hasEbayFeeUpdate
          ? "eBay fees only apply to eBay orders"
          : "No updates to apply",
      });
      continue;
    }

    try {
      const updated = await updateOrderCosts(shopifyId, patch);
      if (!updated) {
        failed.push({
          shopifyId,
          orderNumber: existing.orderNumber,
          error: "Update failed",
        });
        continue;
      }

      updatedCount += 1;

      if (!isEbay && hasEbayFeeUpdate) {
        skipped.push({
          shopifyId,
          orderNumber: existing.orderNumber,
          reason: "Updated costs; eBay fees skipped (not eBay)",
        });
      }
    } catch (error) {
      failed.push({
        shopifyId,
        orderNumber: existing.orderNumber,
        error: error instanceof Error ? error.message : "Update failed",
      });
    }
  }

  return { updatedCount, skipped, failed };
}
