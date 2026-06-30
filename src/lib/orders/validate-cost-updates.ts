export type CostUpdateBody = {
  ebayFeeRatePercent?: number | null;
  ebayAdsFeeRatePercent?: number | null;
  shippingLabelCost?: number | null;
  productCost?: number | null;
};

export function validateCostUpdateBody(
  body: CostUpdateBody,
): string | null {
  if (
    body.ebayFeeRatePercent !== null &&
    body.ebayFeeRatePercent !== undefined &&
    (typeof body.ebayFeeRatePercent !== "number" ||
      !Number.isFinite(body.ebayFeeRatePercent) ||
      body.ebayFeeRatePercent < 0 ||
      body.ebayFeeRatePercent > 100)
  ) {
    return "ebayFeeRatePercent must be between 0 and 100.";
  }

  if (
    body.ebayAdsFeeRatePercent !== null &&
    body.ebayAdsFeeRatePercent !== undefined &&
    (typeof body.ebayAdsFeeRatePercent !== "number" ||
      !Number.isFinite(body.ebayAdsFeeRatePercent) ||
      body.ebayAdsFeeRatePercent < 0 ||
      body.ebayAdsFeeRatePercent > 100)
  ) {
    return "ebayAdsFeeRatePercent must be between 0 and 100.";
  }

  if (
    body.shippingLabelCost !== null &&
    body.shippingLabelCost !== undefined &&
    (typeof body.shippingLabelCost !== "number" ||
      !Number.isFinite(body.shippingLabelCost) ||
      body.shippingLabelCost < 0)
  ) {
    return "shippingLabelCost must be a non-negative number.";
  }

  if (
    body.productCost !== null &&
    body.productCost !== undefined &&
    (typeof body.productCost !== "number" ||
      !Number.isFinite(body.productCost) ||
      body.productCost < 0)
  ) {
    return "productCost must be a non-negative number.";
  }

  return null;
}

export function hasAnyCostUpdate(body: CostUpdateBody): boolean {
  return (
    body.ebayFeeRatePercent !== undefined ||
    body.ebayAdsFeeRatePercent !== undefined ||
    body.shippingLabelCost !== undefined ||
    body.productCost !== undefined
  );
}
