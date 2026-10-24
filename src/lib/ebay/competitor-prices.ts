import { fetchCompetitorBrowseSnapshot } from "@/lib/ebay/browse-client";
import {
  matchOurSkuForCompetitorRow,
  specificsMatchKey,
  type CompetitorPriceRow,
  type EbayCompetitorListingRow,
  type OurListingSkuOption,
} from "@/lib/ebay/competitor-prices-shared";
import {
  fetchEbayListingDetails,
  type EbayListingVariation,
} from "@/lib/ebay/listing-details";
import { createSupabaseAdmin } from "@/lib/supabase/client";

export type {
  CompetitorPriceBySku,
  CompetitorPriceRow,
  EbayCompetitorListingRow,
  OurListingSkuOption,
} from "@/lib/ebay/competitor-prices-shared";

export {
  cheapestCompetitorByOurSku,
  matchOurSkuForCompetitorRow,
  specificsMatchKey,
} from "@/lib/ebay/competitor-prices-shared";

function normalizeItemId(value: string): string {
  const trimmed = value.trim();
  const fromUrl = trimmed.match(/\/itm\/(\d{6,})/);
  if (fromUrl?.[1]) {
    return fromUrl[1];
  }
  const digits = trimmed.match(/(\d{6,})/);
  return digits?.[1] ?? trimmed;
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
    snapshot.variations.map((row) => ({
      ...row,
      ourSku: row.ourSku ?? null,
    })),
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
