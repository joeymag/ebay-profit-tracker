import { getSalesChannel } from "@/lib/orders/channel";
import { PRODUCT_COST_VAT_RATE } from "@/lib/orders/product-cost-vat";
import type { StoredOrder } from "@/lib/orders/types";

/** Amazon marketplace fee applied to order revenue. */
export const AMAZON_FEE_RATE = 0.185;

/** eBay Final Value Fee threshold (GBP order total). */
export const EBAY_FINAL_VALUE_FEE_THRESHOLD = Number(
  process.env.EBAY_FINAL_VALUE_FEE_THRESHOLD ?? 10,
);

/** FVF when order total is below the threshold. */
export const EBAY_FINAL_VALUE_FEE_BELOW_THRESHOLD = Number(
  process.env.EBAY_FINAL_VALUE_FEE_BELOW ?? 0.3,
);

/** FVF when order total is at or above the threshold. */
export const EBAY_FINAL_VALUE_FEE_ABOVE_THRESHOLD = Number(
  process.env.EBAY_FINAL_VALUE_FEE ?? 0.1,
);

/** @deprecated Use computeEbayFinalValueFee(revenue) for tiered FVF. */
export const EBAY_FINAL_VALUE_FEE = EBAY_FINAL_VALUE_FEE_ABOVE_THRESHOLD;

export function computeEbayFinalValueFee(revenue: number): number {
  if (!Number.isFinite(revenue) || revenue < 0) {
    return EBAY_FINAL_VALUE_FEE_ABOVE_THRESHOLD;
  }

  return revenue >= EBAY_FINAL_VALUE_FEE_THRESHOLD
    ? EBAY_FINAL_VALUE_FEE_ABOVE_THRESHOLD
    : EBAY_FINAL_VALUE_FEE_BELOW_THRESHOLD;
}

export type EbayFeeBreakdown = {
  exVat: number | null;
  vat: number | null;
  inclVat: number | null;
};

export type EbayFees = {
  /** Flat per-order Final Value Fee. */
  finalValueFee: number;
  sellingFeeExVat: number | null;
  sellingFeeVat: number | null;
  /** eBay selling fee including VAT. */
  sellingFee: number | null;
  adsFeeExVat: number | null;
  adsFeeVat: number | null;
  /** eBay ads fee including VAT. */
  adsFee: number | null;
  total: number;
};

function ebayFeeAmount(
  revenue: number,
  rate: number | null | undefined,
): number | null {
  if (rate == null || !Number.isFinite(rate) || rate < 0) {
    return null;
  }

  return revenue * rate;
}

export function getEbayPercentFeeBreakdown(
  revenue: number,
  feeRate?: number | null,
): EbayFeeBreakdown {
  const exVat = ebayFeeAmount(revenue, feeRate);
  if (exVat == null) {
    return { exVat: null, vat: null, inclVat: null };
  }

  const vat = exVat * PRODUCT_COST_VAT_RATE;
  return {
    exVat,
    vat,
    inclVat: exVat + vat,
  };
}

export function getEbayAdsFeeBreakdown(
  revenue: number,
  ebayAdsFeeRate?: number | null,
): EbayFeeBreakdown {
  return getEbayPercentFeeBreakdown(revenue, ebayAdsFeeRate);
}

export function computeEbayFees(
  revenue: number,
  ebayFeeRate?: number | null,
  ebayAdsFeeRate?: number | null,
): EbayFees {
  const sellingBreakdown = getEbayPercentFeeBreakdown(revenue, ebayFeeRate);
  const adsBreakdown = getEbayPercentFeeBreakdown(revenue, ebayAdsFeeRate);
  const finalValueFee = computeEbayFinalValueFee(revenue);

  return {
    finalValueFee,
    sellingFeeExVat: sellingBreakdown.exVat,
    sellingFeeVat: sellingBreakdown.vat,
    sellingFee: sellingBreakdown.inclVat,
    adsFeeExVat: adsBreakdown.exVat,
    adsFeeVat: adsBreakdown.vat,
    adsFee: adsBreakdown.inclVat,
    total:
      finalValueFee +
      (sellingBreakdown.inclVat ?? 0) +
      (adsBreakdown.inclVat ?? 0),
  };
}

export type EbayDashboardFeeStats = {
  ebaySellingFees: number;
  ebayAdsFees: number;
  ebayOrders: number;
  ebayOrdersWithSellingFee: number;
  ebayOrdersWithAdsFee: number;
};

/** Sum eBay selling fees (incl VAT + FVF) and ads fees (incl VAT) for dashboard totals. */
export function aggregateEbayDashboardFees(
  orders: Pick<
    StoredOrder,
    "revenue" | "tags" | "ebayFeeRate" | "ebayAdsFeeRate"
  >[],
): EbayDashboardFeeStats {
  let ebaySellingFees = 0;
  let ebayAdsFees = 0;
  let ebayOrders = 0;
  let ebayOrdersWithSellingFee = 0;
  let ebayOrdersWithAdsFee = 0;

  for (const order of orders) {
    if (getSalesChannel(order.tags) !== "eBay") {
      continue;
    }

    ebayOrders += 1;
    const fees = computeEbayFees(
      order.revenue,
      order.ebayFeeRate,
      order.ebayAdsFeeRate,
    );

    ebaySellingFees += fees.finalValueFee;
    if (fees.sellingFee != null) {
      ebaySellingFees += fees.sellingFee;
      ebayOrdersWithSellingFee += 1;
    }
    if (fees.adsFee != null) {
      ebayAdsFees += fees.adsFee;
      ebayOrdersWithAdsFee += 1;
    }
  }

  return {
    ebaySellingFees,
    ebayAdsFees,
    ebayOrders,
    ebayOrdersWithSellingFee,
    ebayOrdersWithAdsFee,
  };
}

export function computePlatformFee(
  revenue: number,
  tags: string | null | undefined,
  ebayFeeRate?: number | null,
  ebayAdsFeeRate?: number | null,
): number | null {
  const channel = getSalesChannel(tags);

  if (channel === "Amazon") {
    return revenue * AMAZON_FEE_RATE;
  }

  if (channel === "eBay") {
    return computeEbayFees(revenue, ebayFeeRate, ebayAdsFeeRate).total;
  }

  return null;
}

export function formatAmazonFeeLabel(): string {
  return `Amazon fee (${(AMAZON_FEE_RATE * 100).toFixed(1)}%)`;
}

export function formatEbayFeeLabel(feeRate: number): string {
  return `eBay selling fee (${(feeRate * 100).toFixed(1)}%) ex-VAT`;
}

export function formatEbaySellingFeeVatLabel(
  rate = PRODUCT_COST_VAT_RATE,
): string {
  return `VAT on eBay selling fee (${(rate * 100).toFixed(0)}%)`;
}

export function formatEbayAdsFeeLabel(feeRate: number): string {
  return `eBay ads fee (${(feeRate * 100).toFixed(1)}%) ex-VAT`;
}

export function formatEbayAdsFeeVatLabel(
  rate = PRODUCT_COST_VAT_RATE,
): string {
  return `VAT on eBay ads fee (${(rate * 100).toFixed(0)}%)`;
}

export function formatEbayFinalValueFeeSchedule(): string {
  return `£${EBAY_FINAL_VALUE_FEE_BELOW_THRESHOLD.toFixed(2)} under £${EBAY_FINAL_VALUE_FEE_THRESHOLD.toFixed(0)} · £${EBAY_FINAL_VALUE_FEE_ABOVE_THRESHOLD.toFixed(2)} at £${EBAY_FINAL_VALUE_FEE_THRESHOLD.toFixed(0)}+`;
}

export function formatEbayFinalValueFeeLabel(revenue?: number): string {
  if (revenue != null && Number.isFinite(revenue)) {
    return `eBay Final Value Fee (£${computeEbayFinalValueFee(revenue).toFixed(2)})`;
  }

  return `eBay Final Value Fee (${formatEbayFinalValueFeeSchedule()})`;
}

/** @deprecated Use formatEbayFinalValueFeeSchedule() for tiered FVF copy. */
export function formatEbayFinalValueFeeAmount(): string {
  return formatEbayFinalValueFeeSchedule();
}
