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
>;

export type OrderCostFieldStatus = {
  isEbay: boolean;
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
  const hasActualEbayAdsFees =
    order.ebayAdsFeeActual != null && order.ebayAdsFeeActual >= 0;

  return {
    isEbay,
    productCostMissing: order.productCost == null,
    postageMissing: order.shippingLabelCost == null,
    ebayFeeMissing: isEbay && !hasActualEbayFees && order.ebayFeeRate == null,
    ebayAdsFeeMissing:
      isEbay &&
      !hasActualEbayFees &&
      !hasActualEbayAdsFees &&
      order.ebayAdsFeeRate == null,
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

  if (status.ebayFeeMissing) {
    missingCosts.push("eBay selling fee %");
  }

  if (status.ebayAdsFeeMissing) {
    missingCosts.push("eBay ads fee %");
  }

  return missingCosts;
}

export function isOrderCostsIncomplete(order: CostCompletenessInput): boolean {
  return getMissingOrderCosts(order).length > 0;
}
