export type ListingTrafficRow = {
  listingId: string;
  title: string | null;
  imageUrl?: string | null;
  price?: number | null;
  currency?: string | null;
  condition?: string | null;
  quantityAvailable?: number | null;
  availabilityStatus?: string | null;
  itemWebUrl?: string | null;
  sku?: string | null;
  searchImpressions: number | null;
  totalImpressions: number | null;
  allImpressions: number | null;
  views: number | null;
  clickThroughRate: number | null;
  transactions: number | null;
  salesConversionRate: number | null;
};

export type ListingTrafficReport = {
  range: string;
  rangeLabel: string;
  startDate: string | null;
  endDate: string | null;
  lastUpdatedDate: string | null;
  marketplaceId: string;
  listings: ListingTrafficRow[];
  warnings: string[];
};

export function formatPercent(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

export function ebayListingUrl(listingId: string, marketplaceId: string): string {
  if (marketplaceId === "EBAY_US" || marketplaceId === "EBAY_MOTORS_US") {
    return `https://www.ebay.com/itm/${listingId}`;
  }

  return `https://www.ebay.co.uk/itm/${listingId}`;
}
