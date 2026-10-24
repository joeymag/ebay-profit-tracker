import {
  fetchCompetitorBrowseSnapshot,
  type CompetitorPriceRow,
} from "@/lib/ebay/browse-client";
import {
  fetchEbayListingDetails,
  type EbayListingVariation,
} from "@/lib/ebay/listing-details";
import { createSupabaseAdmin } from "@/lib/supabase/client";

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

function normalizeItemId(value: string): string {
  const trimmed = value.trim();
  const fromUrl = trimmed.match(/\/itm\/(\d{6,})/);
  if (fromUrl?.[1]) {
    return fromUrl[1];
  }
  const digits = trimmed.match(/(\d{6,})/);
  return digits?.[1] ?? trimmed;
}

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

function normalizePriceRows(prices: unknown): CompetitorPriceRow[] {
  if (!Array.isArray(prices)) {
    return [];
  }
  return prices.map((row) => {
    const item = row as Partial<CompetitorPriceRow>;
    return {
      sku: item.sku ?? null,
      ourSku: item.ourSku?.trim() || null,
      price: typeof item.price === "number" ? item.price : null,
      currency: item.currency ?? null,
      quantityAvailable:
        typeof item.quantityAvailable === "number"
          ? item.quantityAvailable
          : null,
      specificsPairs: Array.isArray(item.specificsPairs)
        ? item.specificsPairs
        : [],
      specificsLabel: item.specificsLabel?.trim() || "Default",
    };
  });
}

function mergePreservedOurSkus(
  previous: CompetitorPriceRow[],
  next: CompetitorPriceRow[],
): CompetitorPriceRow[] {
  const byLabel = new Map(
    previous
      .filter((row) => row.ourSku)
      .map((row) => [row.specificsLabel, row.ourSku] as const),
  );
  const byKey = new Map(
    previous
      .filter((row) => row.ourSku)
      .map((row) => [specificsMatchKey(row.specificsPairs), row.ourSku] as const),
  );

  return next.map((row) => ({
    ...row,
    ourSku:
      byLabel.get(row.specificsLabel) ??
      byKey.get(specificsMatchKey(row.specificsPairs)) ??
      row.ourSku ??
      null,
  }));
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

  // Fall back: all competitor values appear in our specifics string.
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

export async function listOurListingSkuOptions(
  ourListingId: string,
): Promise<OurListingSkuOption[]> {
  try {
    const listing = await fetchEbayListingDetails(ourListingId);
    return skuOptionsFromVariations(listing.variations);
  } catch {
    return [];
  }
}

export function skuOptionsFromVariations(
  variations: EbayListingVariation[],
): OurListingSkuOption[] {
  const options: OurListingSkuOption[] = [];
  for (const variation of variations) {
    const sku = variation.sku?.trim();
    if (!sku) {
      continue;
    }
    options.push({
      sku,
      specifics: variation.specifics,
      specificsKey: specificsMatchKey(variation.specificsPairs),
      price: variation.price,
      currency: variation.currency,
    });
  }
  return options;
}

export async function listCompetitorListings(
  ourListingId: string,
): Promise<EbayCompetitorListingRow[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("ebay_competitor_listings")
    .select("*")
    .eq("our_listing_id", ourListingId.trim())
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRow);
}

export async function upsertCompetitorListing(input: {
  ourListingId: string;
  competitorName: string;
  competitorItemId: string;
}): Promise<EbayCompetitorListingRow> {
  const ourListingId = input.ourListingId.trim();
  const competitorName = input.competitorName.trim();
  const competitorItemId = normalizeItemId(input.competitorItemId);

  if (!ourListingId) {
    throw new Error("Our listing ID is required.");
  }
  if (!competitorName) {
    throw new Error("Competitor name is required.");
  }
  if (!competitorItemId) {
    throw new Error("Competitor item ID is required.");
  }

  const snapshot = await fetchCompetitorBrowseSnapshot(competitorItemId);
  if (!snapshot?.variations.length) {
    throw new Error(
      `No Browse prices found for item ${competitorItemId}. Check the ID and marketplace.`,
    );
  }

  const supabase = createSupabaseAdmin();
  const { data: existing } = await supabase
    .from("ebay_competitor_listings")
    .select("prices")
    .eq("our_listing_id", ourListingId)
    .eq("competitor_item_id", competitorItemId)
    .maybeSingle();

  let prices = mergePreservedOurSkus(
    normalizePriceRows(existing?.prices),
    snapshot.variations.map((row) => ({ ...row, ourSku: row.ourSku ?? null })),
  );

  const ourOptions = await listOurListingSkuOptions(ourListingId);
  if (ourOptions.length) {
    prices = prices.map((row) => ({
      ...row,
      ourSku: row.ourSku || matchOurSkuForCompetitorRow(row, ourOptions),
    }));
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ebay_competitor_listings")
    .upsert(
      {
        our_listing_id: ourListingId,
        competitor_name: competitorName,
        competitor_item_id: competitorItemId,
        competitor_title: snapshot.title,
        competitor_url: snapshot.itemWebUrl,
        variation_count: prices.length,
        prices,
        fetched_at: now,
        updated_at: now,
      },
      { onConflict: "our_listing_id,competitor_item_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRow(data);
}

export async function refreshCompetitorListing(
  id: string,
  ourListingId: string,
): Promise<EbayCompetitorListingRow> {
  const supabase = createSupabaseAdmin();
  const { data: existing, error: loadError } = await supabase
    .from("ebay_competitor_listings")
    .select("*")
    .eq("id", id)
    .eq("our_listing_id", ourListingId.trim())
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }
  if (!existing) {
    throw new Error("Competitor listing not found.");
  }

  return upsertCompetitorListing({
    ourListingId,
    competitorName: existing.competitor_name,
    competitorItemId: existing.competitor_item_id,
  });
}

export async function updateCompetitorOurSku(input: {
  competitorId: string;
  ourListingId: string;
  specificsLabel: string;
  ourSku: string | null;
}): Promise<EbayCompetitorListingRow> {
  const supabase = createSupabaseAdmin();
  const { data: existing, error: loadError } = await supabase
    .from("ebay_competitor_listings")
    .select("*")
    .eq("id", input.competitorId)
    .eq("our_listing_id", input.ourListingId.trim())
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }
  if (!existing) {
    throw new Error("Competitor listing not found.");
  }

  const ourSku = input.ourSku?.trim() || null;
  const prices = normalizePriceRows(existing.prices).map((row) =>
    row.specificsLabel === input.specificsLabel
      ? { ...row, ourSku }
      : row,
  );

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ebay_competitor_listings")
    .update({ prices, updated_at: now })
    .eq("id", input.competitorId)
    .eq("our_listing_id", input.ourListingId.trim())
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRow(data);
}

export async function autoMatchCompetitorOurSkus(input: {
  competitorId: string;
  ourListingId: string;
}): Promise<EbayCompetitorListingRow> {
  const supabase = createSupabaseAdmin();
  const { data: existing, error: loadError } = await supabase
    .from("ebay_competitor_listings")
    .select("*")
    .eq("id", input.competitorId)
    .eq("our_listing_id", input.ourListingId.trim())
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }
  if (!existing) {
    throw new Error("Competitor listing not found.");
  }

  const ourOptions = await listOurListingSkuOptions(input.ourListingId);
  if (!ourOptions.length) {
    throw new Error(
      "No SKUs found on your listing. Add SKUs on the Variations tab first.",
    );
  }

  const prices = normalizePriceRows(existing.prices).map((row) => ({
    ...row,
    ourSku: matchOurSkuForCompetitorRow(row, ourOptions) ?? row.ourSku,
  }));

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ebay_competitor_listings")
    .update({ prices, updated_at: now })
    .eq("id", input.competitorId)
    .eq("our_listing_id", input.ourListingId.trim())
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRow(data);
}

export async function deleteCompetitorListing(
  id: string,
  ourListingId: string,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("ebay_competitor_listings")
    .delete()
    .eq("id", id)
    .eq("our_listing_id", ourListingId.trim());

  if (error) {
    throw new Error(error.message);
  }
}

function mapRow(row: {
  id: string;
  our_listing_id: string;
  competitor_name: string;
  competitor_item_id: string;
  competitor_title: string | null;
  competitor_url: string | null;
  variation_count: number;
  prices: unknown;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
}): EbayCompetitorListingRow {
  return {
    ...row,
    prices: normalizePriceRows(row.prices),
  };
}
