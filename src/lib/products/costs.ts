import type { ProductCatalog } from "@/lib/products/types";
import {
  normalizeSku,
  resolveLineItemSkuKey,
} from "@/lib/orders/line-item-sku";
import { catalogSkuForTemu } from "@/lib/orders/temu-sku";
import type { StoredLineItem, StoredOrder } from "@/lib/orders/types";

export { normalizeSku } from "@/lib/orders/line-item-sku";

export function buildProductCatalog(
  products: { sku: string; unitCost: number | null; temuSku?: string | null }[],
): ProductCatalog {
  const catalog: ProductCatalog = new Map();
  for (const product of products) {
    const key = normalizeSku(product.sku);
    if (key && product.unitCost != null) {
      catalog.set(key, product.unitCost);
    }
    if (product.temuSku && product.unitCost != null) {
      const temuKey = normalizeSku(product.temuSku);
      if (temuKey) {
        catalog.set(temuKey, product.unitCost);
      }
      // Old Temu-only catalog rows used a TEMU: prefix.
      const legacyKey = normalizeSku(catalogSkuForTemu(product.temuSku));
      if (legacyKey) {
        catalog.set(legacyKey, product.unitCost);
      }
    }
  }
  return catalog;
}

export function getLineItemUnitCost(
  sku: string | null | undefined,
  catalog: ProductCatalog,
  title?: string | null,
  temuSku?: string | null,
): number | null {
  const shopifyKey = resolveLineItemSkuKey(sku, title);
  if (shopifyKey && catalog.has(shopifyKey)) {
    return catalog.get(shopifyKey) ?? null;
  }

  if (temuSku?.trim()) {
    const temuKey = normalizeSku(temuSku);
    if (temuKey && catalog.has(temuKey)) {
      return catalog.get(temuKey) ?? null;
    }
    const legacyKey = normalizeSku(catalogSkuForTemu(temuSku));
    if (legacyKey && catalog.has(legacyKey)) {
      return catalog.get(legacyKey) ?? null;
    }
  }

  return null;
}

export function computeOrderProductCost(
  lineItems: Pick<StoredLineItem, "sku" | "quantity" | "title" | "temuSku">[],
  catalog: ProductCatalog,
): number | null {
  let total = 0;
  let matched = false;

  for (const item of lineItems) {
    const unitCost = getLineItemUnitCost(
      item.sku,
      catalog,
      item.title,
      item.temuSku,
    );
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
    unitCost: getLineItemUnitCost(
      item.sku,
      catalog,
      item.title,
      item.temuSku,
    ),
  }));

  const catalogCost = computeOrderProductCost(lineItems, catalog);

  const productCost =
    order.productCostManual && order.productCost != null
      ? order.productCost
      : (catalogCost ?? order.productCost);

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
