import { getSalesChannel } from "@/lib/orders/channel";
import { resolveLineItemSkuKey } from "@/lib/orders/line-item-sku";
import type { StoredLineItem, StoredOrder } from "@/lib/orders/types";

export type SkuDefaultSourceOrder = Pick<
  StoredOrder,
  | "tags"
  | "ebayFeeRate"
  | "ebayAdsFeeRate"
  | "shippingLabelCost"
  | "createdAt"
> & {
  lineItems: Pick<StoredLineItem, "sku" | "title">[];
};

export type SkuCostDefaults = {
  ebayFeeRate: number | null;
  ebayAdsFeeRate: number | null;
  shippingLabelCost: number | null;
};

function skuKeysFromLineItems(
  lineItems: Pick<StoredLineItem, "sku" | "title">[],
): string[] {
  const keys = new Set<string>();
  for (const item of lineItems) {
    const key = resolveLineItemSkuKey(item.sku, item.title);
    if (key) {
      keys.add(key);
    }
  }
  return [...keys];
}

/** Latest known eBay costs per SKU (newer orders overwrite older). */
export function buildSkuCostDefaultsFromOrders(
  orders: SkuDefaultSourceOrder[],
): Map<string, SkuCostDefaults> {
  const defaults = new Map<string, SkuCostDefaults>();
  const sorted = [...orders].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const order of sorted) {
    if (getSalesChannel(order.tags) !== "eBay") {
      continue;
    }

    const skuKeys = skuKeysFromLineItems(order.lineItems);
    if (!skuKeys.length) {
      continue;
    }

    for (const sku of skuKeys) {
      const entry = defaults.get(sku) ?? {
        ebayFeeRate: null,
        ebayAdsFeeRate: null,
        shippingLabelCost: null,
      };

      if (order.ebayFeeRate != null) {
        entry.ebayFeeRate = order.ebayFeeRate;
      }
      if (order.ebayAdsFeeRate != null) {
        entry.ebayAdsFeeRate = order.ebayAdsFeeRate;
      }
      if (order.shippingLabelCost != null) {
        entry.shippingLabelCost = order.shippingLabelCost;
      }

      defaults.set(sku, entry);
    }
  }

  return defaults;
}

function pickDefaultForField(
  skuKeys: string[],
  defaults: Map<string, SkuCostDefaults>,
  field: keyof SkuCostDefaults,
): number | null {
  for (const sku of skuKeys) {
    const value = defaults.get(sku)?.[field];
    if (value != null) {
      return value;
    }
  }
  return null;
}

/** Fill missing eBay fee/postage fields from the last order with the same SKU. */
export function applySkuCostDefaultsToOrder(
  order: StoredOrder,
  defaults: Map<string, SkuCostDefaults>,
): StoredOrder {
  if (getSalesChannel(order.tags) !== "eBay" || !defaults.size) {
    return order;
  }

  const skuKeys = skuKeysFromLineItems(order.lineItems);
  if (!skuKeys.length) {
    return order;
  }

  const ebayFeeRate =
    order.ebayFeeRate ??
    pickDefaultForField(skuKeys, defaults, "ebayFeeRate");
  const ebayAdsFeeRate =
    order.ebayAdsFeeRate ??
    pickDefaultForField(skuKeys, defaults, "ebayAdsFeeRate");
  const shippingLabelCost =
    order.shippingLabelCost ??
    pickDefaultForField(skuKeys, defaults, "shippingLabelCost");

  if (
    ebayFeeRate === order.ebayFeeRate &&
    ebayAdsFeeRate === order.ebayAdsFeeRate &&
    shippingLabelCost === order.shippingLabelCost
  ) {
    return order;
  }

  return {
    ...order,
    ebayFeeRate,
    ebayAdsFeeRate,
    shippingLabelCost,
  };
}

export function applySkuCostDefaultsToOrders(
  orders: StoredOrder[],
  defaults: Map<string, SkuCostDefaults>,
): StoredOrder[] {
  return orders.map((order) => applySkuCostDefaultsToOrder(order, defaults));
}
