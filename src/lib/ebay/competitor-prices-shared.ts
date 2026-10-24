/**
 * Client-safe competitor price types and helpers (no Node/fs imports).
 */

export type CompetitorPriceRow = {
  sku: string | null;
  ourSku: string | null;
  price: number | null;
  currency: string | null;
  quantityAvailable: number | null;
  specificsPairs: Array<{ name: string; value: string }>;
  specificsLabel: string;
};

export type EbayCompetitorListingRow = {
  id: string;
  our_listing_id: string;
  competitor_name: string;
  competitor_item_id: string;
  competitor_title: string | null;
  competitor_url: string | null;
  variation_count: number;
  prices: CompetitorPriceRow[];
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OurListingSkuOption = {
  sku: string;
  specifics: string;
  specificsKey: string;
  price: number | null;
  currency: string | null;
};

/** Cheapest linked competitor price for one of our SKUs. */
export type CompetitorPriceBySku = {
  ourSku: string;
  competitorName: string;
  competitorItemId: string;
  competitorPrice: number;
  currency: string | null;
  specificsLabel: string;
};

export function specificsMatchKey(
  pairs: Array<{ name: string; value: string }>,
): string {
  return pairs
    .map((pair) => ({
      name: pair.name.trim().toLowerCase(),
      value: pair.value.trim().toLowerCase().replace(/\s+/g, " "),
    }))
    .filter((pair) => pair.name && pair.value)
    .sort((a, b) => a.name.localeCompare(b.name) || a.value.localeCompare(b.value))
    .map((pair) => `${pair.name}=${pair.value}`)
    .join("|");
}

/**
 * For each of our SKUs, pick the lowest competitor price among saved mappings.
 */
export function cheapestCompetitorByOurSku(
  competitors: EbayCompetitorListingRow[],
): Map<string, CompetitorPriceBySku> {
  const map = new Map<string, CompetitorPriceBySku>();

  for (const competitor of competitors) {
    for (const row of competitor.prices) {
      const ourSku = row.ourSku?.trim();
      if (!ourSku || row.price == null || !Number.isFinite(row.price)) {
        continue;
      }

      const current = map.get(ourSku);
      if (!current || row.price < current.competitorPrice) {
        map.set(ourSku, {
          ourSku,
          competitorName: competitor.competitor_name,
          competitorItemId: competitor.competitor_item_id,
          competitorPrice: row.price,
          currency: row.currency,
          specificsLabel: row.specificsLabel,
        });
      }
    }
  }

  return map;
}

export function matchOurSkuForCompetitorRow(
  row: CompetitorPriceRow,
  ourOptions: OurListingSkuOption[],
): string | null {
  const key = specificsMatchKey(row.specificsPairs);
  if (!key) {
    return null;
  }
  const exact = ourOptions.find((option) => option.specificsKey === key);
  if (exact) {
    return exact.sku;
  }

  const values = row.specificsPairs
    .map((pair) => pair.value.trim().toLowerCase())
    .filter(Boolean);
  if (!values.length) {
    return null;
  }
  const fuzzy = ourOptions.find((option) => {
    const haystack = option.specifics.toLowerCase();
    return values.every((value) => haystack.includes(value));
  });
  return fuzzy?.sku ?? null;
}
