import { getSalesChannel } from "@/lib/orders/channel";
import type { StoredOrder } from "@/lib/orders/types";

/** VAT added on top of ex-VAT product cost for eBay and Amazon orders. */
export const PRODUCT_COST_VAT_RATE = Number(
  process.env.PRODUCT_COST_VAT_RATE ?? 0.2,
);

export function isProductCostWithVat(
  tags: string | null | undefined,
): boolean {
  const channel = getSalesChannel(tags);
  return channel === "eBay" || channel === "Amazon";
}

export function productCostVatAmount(
  productCostExVat: number,
  tags: string | null | undefined,
): number {
  if (!isProductCostWithVat(tags)) {
    return 0;
  }

  return productCostExVat * PRODUCT_COST_VAT_RATE;
}

export function effectiveProductCost(
  productCostExVat: number | null | undefined,
  tags: string | null | undefined,
): number | null {
  if (productCostExVat == null) {
    return null;
  }

  if (isProductCostWithVat(tags)) {
    return productCostExVat * (1 + PRODUCT_COST_VAT_RATE);
  }

  return productCostExVat;
}

export function formatProductCostVatLabel(
  rate = PRODUCT_COST_VAT_RATE,
): string {
  return `VAT on product cost (${(rate * 100).toFixed(0)}%)`;
}

export function getProductCostBreakdown(
  order: Pick<StoredOrder, "productCost" | "tags">,
): {
  exVat: number | null;
  vat: number | null;
  inclVat: number | null;
} {
  if (order.productCost == null) {
    return { exVat: null, vat: null, inclVat: null };
  }

  const exVat = order.productCost;
  const vat = isProductCostWithVat(order.tags)
    ? productCostVatAmount(exVat, order.tags)
    : 0;

  return {
    exVat,
    vat: vat > 0 ? vat : null,
    inclVat: effectiveProductCost(exVat, order.tags),
  };
}
