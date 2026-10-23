import {
  fetchCompetitorBrowseSnapshot,
  type CompetitorPriceRow,
} from "@/lib/ebay/browse-client";
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

function normalizeItemId(value: string): string {
  const trimmed = value.trim();
  const fromUrl = trimmed.match(/\/itm\/(\d{6,})/);
  if (fromUrl?.[1]) {
    return fromUrl[1];
  }
  const digits = trimmed.match(/(\d{6,})/);
  return digits?.[1] ?? trimmed;
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

  const now = new Date().toISOString();
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("ebay_competitor_listings")
    .upsert(
      {
        our_listing_id: ourListingId,
        competitor_name: competitorName,
        competitor_item_id: competitorItemId,
        competitor_title: snapshot.title,
        competitor_url: snapshot.itemWebUrl,
        variation_count: snapshot.variations.length,
        prices: snapshot.variations,
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
    prices: Array.isArray(row.prices)
      ? (row.prices as CompetitorPriceRow[])
      : [],
  };
}
