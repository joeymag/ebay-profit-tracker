import { getSalesChannel } from "@/lib/orders/channel";
import { getMissingOrderCosts } from "@/lib/orders/cost-completeness";
import { computeOrderFinancials } from "@/lib/orders/financials";
import {
  AMAZON_FEE_RATE,
  computeEbayFinalValueFee,
  EBAY_FINAL_VALUE_FEE_ABOVE_THRESHOLD,
  EBAY_FINAL_VALUE_FEE_BELOW_THRESHOLD,
  EBAY_FINAL_VALUE_FEE_THRESHOLD,
} from "@/lib/orders/platform-fees";
import {
  effectiveProductCost,
  PRODUCT_COST_VAT_RATE,
} from "@/lib/orders/product-cost-vat";
import type { StoredOrder } from "@/lib/orders/types";

export type PricingOrderInput = Pick<
  StoredOrder,
  | "productCost"
  | "shippingLabelCost"
  | "tags"
  | "ebayFeeRate"
  | "ebayAdsFeeRate"
  | "ebayFeesActual"
  | "ebayAdsFeeActual"
  | "revenue"
>;

export type RequiredSellPriceBreakdown = {
  productCost: number;
  postageCost: number;
  flatEbayFee: number;
  platformFees: number;
  totalCost: number;
  profit: number;
};

export type RequiredSellPriceResult = {
  desiredProfit: number;
  fixedCosts: number;
  /** Share of revenue taken by percentage-based platform fees (incl VAT on eBay). */
  variableFeeRate: number;
  requiredSellPrice: number | null;
  breakdownAtRequiredPrice: RequiredSellPriceBreakdown | null;
  missingCosts: string[];
  error: string | null;
};

function ebayPercentFeeInclVat(rate: number | null | undefined): number {
  if (rate == null || !Number.isFinite(rate) || rate < 0) {
    return 0;
  }

  return rate * (1 + PRODUCT_COST_VAT_RATE);
}

export function getVariablePlatformFeeRate(
  tags: string | null | undefined,
  ebayFeeRate?: number | null,
  ebayAdsFeeRate?: number | null,
): number {
  const channel = getSalesChannel(tags);

  if (channel === "Amazon") {
    return AMAZON_FEE_RATE;
  }

  if (channel === "eBay") {
    return (
      ebayPercentFeeInclVat(ebayFeeRate) + ebayPercentFeeInclVat(ebayAdsFeeRate)
    );
  }

  return 0;
}

function computeRequiredSellPriceForEbay(
  baseFixed: number,
  desiredProfit: number,
  variableFeeRate: number,
): number {
  const denominator = 1 - variableFeeRate;
  const priceWithHigherFvf =
    (baseFixed + EBAY_FINAL_VALUE_FEE_BELOW_THRESHOLD + desiredProfit) /
    denominator;

  if (priceWithHigherFvf < EBAY_FINAL_VALUE_FEE_THRESHOLD) {
    return priceWithHigherFvf;
  }

  return (
    (baseFixed + EBAY_FINAL_VALUE_FEE_ABOVE_THRESHOLD + desiredProfit) /
    denominator
  );
}

export function getFixedOrderCosts(order: PricingOrderInput): {
  productCost: number;
  postageCost: number;
  flatEbayFee: number;
  total: number;
  missingCosts: string[];
} {
  const channel = getSalesChannel(order.tags);
  const missingCosts = getMissingOrderCosts(order);

  const productCost = effectiveProductCost(order.productCost, order.tags) ?? 0;
  const postageCost = order.shippingLabelCost ?? 0;
  const flatEbayFee =
    channel === "eBay" ? computeEbayFinalValueFee(order.revenue ?? 0) : 0;

  return {
    productCost,
    postageCost,
    flatEbayFee,
    total: productCost + postageCost + flatEbayFee,
    missingCosts,
  };
}

export function computeRequiredSellPrice(
  order: PricingOrderInput,
  desiredProfit: number,
): RequiredSellPriceResult {
  if (!Number.isFinite(desiredProfit) || desiredProfit < 0) {
    return {
      desiredProfit,
      fixedCosts: 0,
      variableFeeRate: 0,
      requiredSellPrice: null,
      breakdownAtRequiredPrice: null,
      missingCosts: [],
      error: "Enter a valid profit amount (0 or more).",
    };
  }

  const fixed = getFixedOrderCosts(order);
  const variableFeeRate = getVariablePlatformFeeRate(
    order.tags,
    order.ebayFeeRate,
    order.ebayAdsFeeRate,
  );
  const channel = getSalesChannel(order.tags);
  const baseFixed = fixed.productCost + fixed.postageCost;

  if (variableFeeRate >= 1) {
    return {
      desiredProfit,
      fixedCosts: fixed.total,
      variableFeeRate,
      requiredSellPrice: null,
      breakdownAtRequiredPrice: null,
      missingCosts: fixed.missingCosts,
      error: "Platform fees are 100% or more of revenue — target profit is not possible.",
    };
  }

  const requiredSellPrice =
    channel === "eBay"
      ? computeRequiredSellPriceForEbay(
          baseFixed,
          desiredProfit,
          variableFeeRate,
        )
      : (baseFixed + desiredProfit) / (1 - variableFeeRate);

  if (!Number.isFinite(requiredSellPrice) || requiredSellPrice < 0) {
    return {
      desiredProfit,
      fixedCosts: fixed.total,
      variableFeeRate,
      requiredSellPrice: null,
      breakdownAtRequiredPrice: null,
      missingCosts: fixed.missingCosts,
      error: "Could not calculate a sell price for this profit target.",
    };
  }

  const financials = computeOrderFinancials({
    revenue: requiredSellPrice,
    productCost: order.productCost,
    shippingLabelCost: order.shippingLabelCost,
    tags: order.tags,
    ebayFeeRate: order.ebayFeeRate,
    ebayAdsFeeRate: order.ebayAdsFeeRate,
    ebayFeesActual: order.ebayFeesActual,
    ebayAdsFeeActual: order.ebayAdsFeeActual,
  });

  const platformFees = financials.platformFee ?? 0;
  const flatEbayFee =
    channel === "eBay" ? computeEbayFinalValueFee(requiredSellPrice) : 0;

  return {
    desiredProfit,
    fixedCosts: baseFixed + flatEbayFee,
    variableFeeRate,
    requiredSellPrice,
    breakdownAtRequiredPrice: {
      productCost: fixed.productCost,
      postageCost: fixed.postageCost,
      flatEbayFee,
      platformFees,
      totalCost: financials.cost ?? fixed.total + platformFees,
      profit: financials.profit ?? desiredProfit,
    },
    missingCosts: fixed.missingCosts,
    error: null,
  };
}

export function getSellPriceComparison(
  order: PricingOrderInput,
  requiredSellPrice: number,
): {
  currentRevenue: number;
  currentProfit: number | null;
  difference: number;
  meetsTarget: boolean;
} | null {
  if (!Number.isFinite(order.revenue) || order.revenue <= 0) {
    return null;
  }

  const current = computeOrderFinancials({
    revenue: order.revenue,
    productCost: order.productCost,
    shippingLabelCost: order.shippingLabelCost,
    tags: order.tags,
    ebayFeeRate: order.ebayFeeRate,
    ebayAdsFeeRate: order.ebayAdsFeeRate,
    ebayFeesActual: order.ebayFeesActual,
    ebayAdsFeeActual: order.ebayAdsFeeActual,
  });

  const difference = order.revenue - requiredSellPrice;

  return {
    currentRevenue: order.revenue,
    currentProfit: current.profit,
    difference,
    meetsTarget: order.revenue >= requiredSellPrice,
  };
}
