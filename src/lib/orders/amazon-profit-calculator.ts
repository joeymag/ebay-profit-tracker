import {
  AMAZON_FEE_RATE,
  formatAmazonFeeLabel,
} from "@/lib/orders/platform-fees";
import {
  PRODUCT_COST_VAT_RATE,
  formatProductCostVatLabel,
} from "@/lib/orders/product-cost-vat";

export type AmazonProfitCalculatorInput = {
  sellPrice: number;
  /** Product cost ex-VAT. */
  productCostExVat: number;
  postage: number;
};

export type AmazonProfitCalculatorResult = {
  revenue: number;
  productCostExVat: number;
  productCostVat: number;
  productCostInclVat: number;
  postage: number;
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
  const postage = input.postage;
  const totalCost = productCostInclVat + postage + amazonFee;
  const profit = revenue - totalCost;
  const marginPercent = revenue > 0 ? (profit / revenue) * 100 : null;

  return {
    revenue,
    productCostExVat,
    productCostVat,
    productCostInclVat,
    postage,
    amazonFee,
    amazonFeeRate: AMAZON_FEE_RATE,
    totalCost,
    profit,
    marginPercent,
  };
}

export {
  AMAZON_FEE_RATE,
  formatAmazonFeeLabel,
  formatProductCostVatLabel,
  PRODUCT_COST_VAT_RATE,
};
