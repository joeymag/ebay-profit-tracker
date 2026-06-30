import type { ProductCatalog } from "@/lib/products/types";
import {
  normalizeSku,
  resolveLineItemSkuKey,
} from "@/lib/orders/line-item-sku";
import type { StoredLineItem, StoredOrder } from "@/lib/orders/types";

export { normalizeSku } from "@/lib/orders/line-item-sku";

export function buildProductCatalog(
  products: { sku: string; unitCost: number | null }[],
): ProductCatalog {
  const catalog: ProductCatalog = new Map();
  for (const product of products) {
    const key = normalizeSku(product.sku);
    if (key && product.unitCost != null) {
      catalog.set(key, product.unitCost);
    }
  }
  return catalog;
}

export function getLineItemUnitCost(
  sku: string | null | undefined,
  catalog: ProductCatalog,
  title?: string | null,
): number | null {
  const key = resolveLineItemSkuKey(sku, title);
  if (!key) {
    return null;
  }
  return catalog.get(key) ?? null;
}

export function computeOrderProductCost(
  lineItems: Pick<StoredLineItem, "sku" | "quantity" | "title">[],
  catalog: ProductCatalog,
): number | null {
  let total = 0;
  let matched = false;

  for (const item of lineItems) {
    const unitCost = getLineItemUnitCost(item.sku, catalog, item.title);
    if (unitCost != null) {
      matched = true;
      total += unitCost * item.quantity;
    }
  }

  return matched ? total : null;
}

export function applyCatalogToOrder(
  order: StoredOrder,
  catalog: ProductCatalog,
): StoredOrder {
  const lineItems = order.lineItems.map((item) => ({
    ...item,
    unitCost: getLineItemUnitCost(item.sku, catalog, item.title),
  }));

  const catalogCost = computeOrderProductCost(lineItems, catalog);

  const productCost =
    order.productCostManual && order.productCost != null
      ? order.productCost
      : catalogCost;

  return {
    ...order,
    lineItems,
    productCost,
  };
}

export function applyCatalogToOrders(
  orders: StoredOrder[],
  catalog: ProductCatalog,
): StoredOrder[] {
  return orders.map((order) => applyCatalogToOrder(order, catalog));
}
