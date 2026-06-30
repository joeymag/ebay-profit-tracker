import {
  computeEbayFees,
  computeEbayFinalValueFee,
  formatEbayFinalValueFeeLabel,
  formatEbayFinalValueFeeSchedule,
} from "@/lib/orders/platform-fees";
import {
  effectiveProductCost,
  PRODUCT_COST_VAT_RATE,
  productCostVatAmount,
} from "@/lib/orders/product-cost-vat";

export type EbayProfitCalculatorInput = {
  sellPrice: number;
  productCostExVat: number;
  ebayFeeRatePercent: number;
  ebayAdsFeeRatePercent: number;
  postage: number;
};

export type EbayProfitCalculatorResult = {
  revenue: number;
  productCostExVat: number;
  productCostVat: number;
  productCostInclVat: number;
  postage: number;
  ebayFees: ReturnType<typeof computeEbayFees>;
  totalCost: number;
  profit: number;
  marginPercent: number | null;
};

export function calculateEbayItemProfit(
  input: EbayProfitCalculatorInput,
): EbayProfitCalculatorResult {
  const revenue = input.sellPrice;
  const ebayFeeRate = input.ebayFeeRatePercent / 100;
  const ebayAdsFeeRate = input.ebayAdsFeeRatePercent / 100;
  const ebayFees = computeEbayFees(revenue, ebayFeeRate, ebayAdsFeeRate);
  const productCostInclVat =
    effectiveProductCost(input.productCostExVat, "eBay-GB") ?? 0;
  const productCostVat = productCostVatAmount(
    input.productCostExVat,
    "eBay-GB",
  );
  const postage = input.postage;
  const totalCost = productCostInclVat + postage + ebayFees.total;
  const profit = revenue - totalCost;
  const marginPercent = revenue > 0 ? (profit / revenue) * 100 : null;

  return {
    revenue,
    productCostExVat: input.productCostExVat,
    productCostVat,
    productCostInclVat,
    postage,
    ebayFees,
    totalCost,
    profit,
    marginPercent,
  };
}

export {
  computeEbayFinalValueFee,
  formatEbayFinalValueFeeLabel,
  formatEbayFinalValueFeeSchedule,
  PRODUCT_COST_VAT_RATE,
};
