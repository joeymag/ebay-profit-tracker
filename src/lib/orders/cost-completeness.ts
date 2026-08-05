import { getSalesChannel } from "@/lib/orders/channel";
import type { StoredOrder } from "@/lib/orders/types";

export type CostCompletenessInput = Pick<
  StoredOrder,
  | "productCost"
  | "shippingLabelCost"
  | "tags"
  | "ebayFeeRate"
  | "ebayAdsFeeRate"
  | "ebayFeesActual"
  | "ebayAdsFeeActual"
> & {
  /** When omitted, missing eBay order ID is not reported (e.g. pricing helpers). */
  ebayOrderId?: string | null;
};

export type OrderCostFieldStatus = {
  isEbay: boolean;
  ebayOrderIdMissing: boolean;
  productCostMissing: boolean;
  postageMissing: boolean;
  ebayFeeMissing: boolean;
  ebayAdsFeeMissing: boolean;
};

export function getOrderCostFieldStatus(
  order: CostCompletenessInput,
): OrderCostFieldStatus {
  const isEbay = getSalesChannel(order.tags) === "eBay";
  const hasActualEbayFees =
    order.ebayFeesActual != null && order.ebayFeesActual >= 0;
  const ebayOrderIdMissing =
    isEbay &&
    order.ebayOrderId !== undefined &&
    !order.ebayOrderId?.trim();

  return {
    isEbay,
    ebayOrderIdMissing,
    productCostMissing: order.productCost == null,
    postageMissing: order.shippingLabelCost == null,
    ebayFeeMissing: isEbay && !ebayOrderIdMissing && !hasActualEbayFees,
    ebayAdsFeeMissing: false,
  };
}

export function getMissingOrderCosts(order: CostCompletenessInput): string[] {
  const status = getOrderCostFieldStatus(order);
  const missingCosts: string[] = [];

  if (status.productCostMissing) {
    missingCosts.push("Product cost");
  }

  if (status.postageMissing) {
    missingCosts.push("Postage cost");
  }

  if (status.ebayOrderIdMissing) {
    missingCosts.push("eBay order ID (re-sync orders from Shopify)");
  } else if (status.ebayFeeMissing) {
    missingCosts.push("eBay fees (sync from Settings)");
  }

  return missingCosts;
}

export function isOrderCostsIncomplete(order: CostCompletenessInput): boolean {
  return getMissingOrderCosts(order).length > 0;
}
