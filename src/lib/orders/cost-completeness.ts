import { getSalesChannel } from "@/lib/orders/channel";
import type { StoredOrder } from "@/lib/orders/types";

export type CostCompletenessInput = Pick<
  StoredOrder,
  | "productCost"
  | "shippingLabelCost"
  | "tags"
  | "ebayFeeRate"
  | "ebayAdsFeeRate"
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

  return {
    isEbay,
    productCostMissing: order.productCost == null,
    postageMissing: order.shippingLabelCost == null,
    ebayFeeMissing: isEbay && order.ebayFeeRate == null,
    ebayAdsFeeMissing: isEbay && order.ebayAdsFeeRate == null,
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
