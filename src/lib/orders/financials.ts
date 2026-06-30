import { isOrderCostsIncomplete } from "@/lib/orders/cost-completeness";
import { effectiveProductCost } from "@/lib/orders/product-cost-vat";
import { computePlatformFee } from "@/lib/orders/platform-fees";
import type { StoredOrder } from "@/lib/orders/types";

export function computeOrderFinancials(
  order: Pick<
    StoredOrder,
    | "revenue"
    | "productCost"
    | "shippingLabelCost"
    | "tags"
    | "ebayFeeRate"
    | "ebayAdsFeeRate"
    | "ebayFeesActual"
  >,
): Pick<StoredOrder, "platformFee" | "cost" | "profit"> {
  const platformFee = computePlatformFee(
    order.revenue,
    order.tags,
    order.ebayFeeRate,
    order.ebayAdsFeeRate,
    order.ebayFeesActual,
  );

  if (isOrderCostsIncomplete(order)) {
    return { platformFee, cost: null, profit: null };
  }

  const productCostTotal = effectiveProductCost(order.productCost, order.tags);

  const cost =
    (productCostTotal ?? 0) +
    (order.shippingLabelCost ?? 0) +
    (platformFee ?? 0);
  const profit = order.revenue - cost;

  return { platformFee, cost, profit };
}

export function withComputedFinancials(order: StoredOrder): StoredOrder {
  const { platformFee, cost, profit } = computeOrderFinancials(order);
  return { ...order, platformFee, cost, profit };
}
