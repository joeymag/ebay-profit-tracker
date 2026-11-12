import {
  AMAZON_FEE_RATE,
  formatAmazonFeeLabel,
} from "@/lib/orders/platform-fees";
import {
  PRODUCT_COST_VAT_RATE,
  formatProductCostVatLabel,
} from "@/lib/orders/product-cost-vat";

export type AmazonFulfilmentType = "FBM" | "FBA";

export type AmazonProfitCalculatorInput = {
  sellPrice: number;
  /** Product cost ex-VAT. */
  productCostExVat: number;
  /**
   * FBM: postage / label you pay.
   * FBA: Amazon fulfilment fee from Seller Central (per unit).
   */
  fulfilmentCost: number;
  fulfilmentType: AmazonFulfilmentType;
};

export type AmazonProfitCalculatorResult = {
  revenue: number;
  productCostExVat: number;
  productCostVat: number;
  productCostInclVat: number;
  fulfilmentType: AmazonFulfilmentType;
  fulfilmentCost: number;
  amazonFee: number;
  amazonFeeRate: number;
  totalCost: number;
  profit: number;
  marginPercent: number | null;
};

export function calculateAmazonItemProfit(
  input: AmazonProfitCalculatorInput,
): AmazonProfitCalculatorResult {
  const revenue = input.sellPrice;
  const amazonFee = revenue * AMAZON_FEE_RATE;
  const productCostExVat = input.productCostExVat;
  const productCostVat = productCostExVat * PRODUCT_COST_VAT_RATE;
  const productCostInclVat = productCostExVat + productCostVat;
  const fulfilmentCost = input.fulfilmentCost;
  const totalCost = productCostInclVat + fulfilmentCost + amazonFee;
  const profit = revenue - totalCost;
  const marginPercent = revenue > 0 ? (profit / revenue) * 100 : null;

  return {
    revenue,
    productCostExVat,
    productCostVat,
    productCostInclVat,
    fulfilmentType: input.fulfilmentType,
    fulfilmentCost,
    amazonFee,
    amazonFeeRate: AMAZON_FEE_RATE,
    totalCost,
    profit,
    marginPercent,
  };
}

export function formatAmazonFulfilmentCostLabel(
  fulfilmentType: AmazonFulfilmentType,
): string {
  return fulfilmentType === "FBA" ? "FBA fulfilment fee" : "Postage";
}

export {
  AMAZON_FEE_RATE,
  formatAmazonFeeLabel,
  formatProductCostVatLabel,
  PRODUCT_COST_VAT_RATE,
};
