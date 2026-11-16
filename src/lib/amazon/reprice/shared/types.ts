export type AmazonRepriceChannel = "standard" | "business";

export type RepriceStrategy =
  | "manual"
  | "match_buybox"
  | "match_lowest"
  | "undercut_lowest"
  | "undercut_buybox";

export type QuantityDiscountLevel = {
  lowerBound: number;
  value: number;
};

export type QuantityDiscountPlan = {
  discountType: "fixed" | "percent";
  levels: QuantityDiscountLevel[];
};

export type AmazonCompetitiveSnapshot = {
  sku: string;
  channel: AmazonRepriceChannel;
  buyBoxPrice: number | null;
  lowestPrice: number | null;
  offerCount: number;
  yourOfferPrice: number | null;
  youHaveBuyBox: boolean | null;
  sellerIdGuess: string | null;
};

export type AmazonRepriceRule = {
  sku: string;
  channel: AmazonRepriceChannel;
  enabled: boolean;
  strategy: RepriceStrategy;
  minPrice: number | null;
  maxPrice: number | null;
  undercutAmount: number;
  /**
   * Standard mid-gap Buy Box: fixed £ shift from the midpoint.
   * Positive keeps more margin; negative is more aggressive. Default 0.
   */
  gapOffsetAmount: number;
  /**
   * Standard mid-gap Buy Box: fraction of (buyBox − current) added to midpoint.
   * e.g. 0.25 = quarter of the gap toward the Buy Box from mid. Default 0.
   */
  gapOffsetPercent: number;
  quantityDiscountPlan: QuantityDiscountPlan | null;
  updatedAt: string;
};

export type RepriceSuggestion = {
  sku: string;
  channel: AmazonRepriceChannel;
  currentPrice: number | null;
  suggestedPrice: number | null;
  reason: string;
  competitive: AmazonCompetitiveSnapshot | null;
  rule: AmazonRepriceRule | null;
};

export type AmazonRepriceEvent = {
  id: number;
  sku: string;
  channel: AmazonRepriceChannel;
  fromPrice: number | null;
  toPrice: number;
  source: string;
  reason: string | null;
  status: string;
  createdAt: string;
};

export type AutoRepriceResult = {
  checked: number;
  applied: number;
  skipped: number;
  failed: number;
  results: Array<{
    sku: string;
    channel: AmazonRepriceChannel;
    status: "applied" | "skipped" | "failed";
    reason: string;
    fromPrice?: number | null;
    toPrice?: number | null;
  }>;
};

export const REPRICE_STRATEGIES = [
  "manual",
  "match_buybox",
  "match_lowest",
  "undercut_lowest",
  "undercut_buybox",
] as const satisfies readonly RepriceStrategy[];

/** Standard beat-Buy-Box / undercut default (£0.10). */
export const STANDARD_DEFAULT_UNDERCUT = 0.1;

/** Business undercut default (£0.01). */
export const BUSINESS_DEFAULT_UNDERCUT = 0.01;

export function defaultUndercutForChannel(
  channel: AmazonRepriceChannel,
): number {
  return channel === "business"
    ? BUSINESS_DEFAULT_UNDERCUT
    : STANDARD_DEFAULT_UNDERCUT;
}
