import { getStoredOrders } from "@/lib/orders/store";
import { resolveLineItemSkuKey } from "@/lib/orders/line-item-sku";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type SkuSalesStats = {
  /** All-time quantity sold (sum of line-item qty). */
  unitsSold: number;
  /** Distinct orders containing this SKU (all time). */
  orderCount: number;
  unitsSold30Days: number;
  unitsSold90Days: number;
  orderCount30Days: number;
};

export type ReorderHint = {
  label: string;
  tone: "urgent" | "consider" | "quiet" | "none";
};

const EMPTY_STATS: SkuSalesStats = {
  unitsSold: 0,
  orderCount: 0,
  unitsSold30Days: 0,
  unitsSold90Days: 0,
  orderCount30Days: 0,
};

type MutableStats = SkuSalesStats & {
  orderIds: Set<number>;
  orderIds30Days: Set<number>;
};

function normalizeSkuKey(sku: string): string {
  return sku.trim().toUpperCase();
}

function emptyMutableStats(): MutableStats {
  return {
    ...EMPTY_STATS,
    orderIds: new Set<number>(),
    orderIds30Days: new Set<number>(),
  };
}

function addSale(
  map: Map<string, MutableStats>,
  skuKey: string,
  quantity: number,
  orderId: number,
  orderDate: Date,
  now: Date,
) {
  const existing = map.get(skuKey) ?? emptyMutableStats();
  existing.unitsSold += quantity;
  existing.orderIds.add(orderId);

  const ageMs = now.getTime() - orderDate.getTime();
  const days90 = 90 * 24 * 60 * 60 * 1000;
  const days30 = 30 * 24 * 60 * 60 * 1000;

  if (ageMs <= days90) {
    existing.unitsSold90Days += quantity;
  }
  if (ageMs <= days30) {
    existing.unitsSold30Days += quantity;
    existing.orderIds30Days.add(orderId);
  }

  map.set(skuKey, existing);
}

function finalizeMap(map: Map<string, MutableStats>): Map<string, SkuSalesStats> {
  const result = new Map<string, SkuSalesStats>();
  for (const [key, stats] of map) {
    result.set(key, {
      unitsSold: stats.unitsSold,
      orderCount: stats.orderIds.size,
      unitsSold30Days: stats.unitsSold30Days,
      unitsSold90Days: stats.unitsSold90Days,
      orderCount30Days: stats.orderIds30Days.size,
    });
  }
  return result;
}

async function buildUnitsSoldMapFromSupabase(): Promise<Map<string, SkuSalesStats>> {
  const supabase = createSupabaseAdmin();
  const map = new Map<string, MutableStats>();
  const now = new Date();

  const { data: lineItems, error: lineError } = await supabase
    .from("order_line_items")
    .select("shopify_order_id, sku, title, quantity");

  if (lineError) {
    throw new Error(lineError.message);
  }

  const orderIds = [...new Set((lineItems ?? []).map((row) => row.shopify_order_id))];
  const orderDates = new Map<number, Date>();

  if (orderIds.length > 0) {
    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("shopify_id, created_at")
      .in("shopify_id", orderIds);

    if (orderError) {
      throw new Error(orderError.message);
    }

    for (const order of orders ?? []) {
      orderDates.set(order.shopify_id, new Date(order.created_at));
    }
  }

  for (const row of lineItems ?? []) {
    const skuKey = resolveLineItemSkuKey(row.sku, row.title);
    if (!skuKey) {
      continue;
    }
    const orderDate = orderDates.get(row.shopify_order_id) ?? now;
    addSale(map, skuKey, row.quantity, row.shopify_order_id, orderDate, now);
  }

  return finalizeMap(map);
}

async function buildUnitsSoldMapFromJson(): Promise<Map<string, SkuSalesStats>> {
  const { orders } = await getStoredOrders();
  const map = new Map<string, MutableStats>();
  const now = new Date();

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    for (const item of order.lineItems) {
      const skuKey = resolveLineItemSkuKey(item.sku, item.title);
      if (!skuKey) {
        continue;
      }
      addSale(map, skuKey, item.quantity, order.shopifyId, orderDate, now);
    }
  }

  return finalizeMap(map);
}

export async function getUnitsSoldMap(): Promise<Map<string, SkuSalesStats>> {
  if (isSupabaseConfigured()) {
    return buildUnitsSoldMapFromSupabase();
  }
  return buildUnitsSoldMapFromJson();
}

export async function getUnitsSoldForSku(sku: string): Promise<SkuSalesStats> {
  const map = await getUnitsSoldMap();
  return map.get(normalizeSkuKey(sku)) ?? EMPTY_STATS;
}

/** Only treat explicit pack options as pack size — not product dimensions in titles. */
export function parsePackSizeFromOptions(
  options: { name: string; value: string }[],
): number | null {
  for (const option of options) {
    const name = option.name.toLowerCase();
    if (name === "title" || name.includes("size") || name.includes("length")) {
      continue;
    }
    const match = option.value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:pc|pack|pk|units?)\b/i);
    if (match) {
      const size = Number.parseFloat(match[1]);
      if (Number.isFinite(size) && size > 0) {
        return size;
      }
    }
  }
  return null;
}

export function formatUnitsSoldDisplay(unitsSold: number): string {
  return String(unitsSold);
}

export function getReorderHint(
  available: number,
  sales: SkuSalesStats,
): ReorderHint {
  if (available > 0) {
    if (available <= 3 && sales.unitsSold30Days > 0) {
      return { label: "Low stock — selling now", tone: "consider" };
    }
    return { label: "In stock", tone: "none" };
  }

  if (sales.unitsSold30Days >= 3) {
    return { label: "Reorder — sold recently", tone: "urgent" };
  }
  if (sales.unitsSold30Days > 0) {
    return { label: "Consider reorder", tone: "consider" };
  }
  if (sales.unitsSold > 0) {
    return { label: "Out of stock — sold before", tone: "consider" };
  }
  return { label: "No sales on record", tone: "quiet" };
}

export function attachSalesInsight(
  available: number,
  sales: SkuSalesStats,
  packSize: number | null = null,
) {
  const reorder = getReorderHint(available, sales);
  return {
    unitsSold: sales.unitsSold,
    orderCount: sales.orderCount,
    unitsSold30Days: sales.unitsSold30Days,
    unitsSold90Days: sales.unitsSold90Days,
    orderCount30Days: sales.orderCount30Days,
    packSize,
    unitsSoldDisplay: formatUnitsSoldDisplay(sales.unitsSold),
    reorderLabel: reorder.label,
    reorderTone: reorder.tone,
  };
}

export type StockSalesInsight = ReturnType<typeof attachSalesInsight>;
