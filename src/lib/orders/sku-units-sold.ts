import { getStoredOrders } from "@/lib/orders/store";
import { resolveLineItemSkuKey } from "@/lib/orders/line-item-sku";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type SkuSalesStats = {
  /** Sum of line-item quantities sold (packs/orders). */
  unitsSold: number;
  /** Distinct orders containing this SKU. */
  orderCount: number;
};

function normalizeSkuKey(sku: string): string {
  return sku.trim().toUpperCase();
}

function addToMap(
  map: Map<string, MutableStats>,
  skuKey: string,
  quantity: number,
  orderId: number,
) {
  const existing = map.get(skuKey) ?? {
    unitsSold: 0,
    orderCount: 0,
    orderIds: new Set<number>(),
  };
  existing.unitsSold += quantity;
  existing.orderIds.add(orderId);
  map.set(skuKey, existing);
}

type MutableStats = SkuSalesStats & { orderIds: Set<number> };

async function buildUnitsSoldMapFromSupabase(): Promise<Map<string, SkuSalesStats>> {
  const supabase = createSupabaseAdmin();
  const map = new Map<string, MutableStats>();

  const { data: lineItems, error } = await supabase
    .from("order_line_items")
    .select("shopify_order_id, sku, title, quantity");

  if (error) {
    throw new Error(error.message);
  }

  for (const row of lineItems ?? []) {
    const skuKey = resolveLineItemSkuKey(row.sku, row.title);
    if (!skuKey) {
      continue;
    }
    addToMap(map, skuKey, row.quantity, row.shopify_order_id);
  }

  const result = new Map<string, SkuSalesStats>();
  for (const [key, stats] of map) {
    result.set(key, {
      unitsSold: stats.unitsSold,
      orderCount: stats.orderIds.size,
    });
  }
  return result;
}

async function buildUnitsSoldMapFromJson(): Promise<Map<string, SkuSalesStats>> {
  const { orders } = await getStoredOrders();
  const map = new Map<string, MutableStats>();

  for (const order of orders) {
    for (const item of order.lineItems) {
      const skuKey = resolveLineItemSkuKey(item.sku, item.title);
      if (!skuKey) {
        continue;
      }
      addToMap(map, skuKey, item.quantity, order.shopifyId);
    }
  }

  const result = new Map<string, SkuSalesStats>();
  for (const [key, stats] of map) {
    result.set(key, {
      unitsSold: stats.unitsSold,
      orderCount: stats.orderIds.size,
    });
  }
  return result;
}

export async function getUnitsSoldMap(): Promise<Map<string, SkuSalesStats>> {
  if (isSupabaseConfigured()) {
    return buildUnitsSoldMapFromSupabase();
  }
  return buildUnitsSoldMapFromJson();
}

export async function getUnitsSoldForSku(sku: string): Promise<SkuSalesStats> {
  const map = await getUnitsSoldMap();
  return map.get(normalizeSkuKey(sku)) ?? { unitsSold: 0, orderCount: 0 };
}

/** Parse pack size from variant option text, e.g. "5", "5pc", "5 pack". */
export function parsePackSizeFromOptions(
  options: { name: string; value: string }[],
): number | null {
  for (const option of options) {
    const match = option.value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:pc|pack|pk|units?)?\b/i);
    if (match) {
      const size = Number.parseFloat(match[1]);
      if (Number.isFinite(size) && size > 0) {
        return size;
      }
    }
  }
  return null;
}

export function formatUnitsSoldDisplay(
  unitsSold: number,
  packSize: number | null,
): string {
  if (packSize != null && packSize > 0) {
    const total = packSize * unitsSold;
    return `${packSize} × ${unitsSold} (${total} units)`;
  }
  return String(unitsSold);
}
