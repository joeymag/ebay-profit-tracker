import {
  fetchActiveEbayListings,
  type ActiveEbayListingsResult,
} from "@/lib/ebay/active-listings";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const REFRESH_MS = 6 * 60 * 60 * 1000;
const UPSERT_BATCH = 200;

export async function persistActiveEbayListings(
  result: ActiveEbayListingsResult,
): Promise<{ saved: number; removed: number }> {
  if (!isSupabaseConfigured()) {
    return { saved: 0, removed: 0 };
  }

  const syncedAt = result.fetchedAt || new Date().toISOString();
  const rows = result.listings
    .filter((listing) => listing.listingId?.trim())
    .map((listing) => ({
      listing_id: listing.listingId!.trim(),
      sku: listing.sku,
      title: listing.title,
      offer_id: listing.offerId,
      status: listing.status,
      format: listing.format,
      marketplace_id: listing.marketplaceId,
      price: listing.price,
      currency: listing.currency,
      quantity: listing.quantity,
      image_url: listing.imageUrl,
      item_web_url: listing.itemWebUrl,
      promo_rate_percent: listing.promoRatePercent,
      promo_ad_status: listing.promoAdStatus,
      promo_campaign_name: listing.promoCampaignName,
      promo_campaign_id: listing.promoCampaignId,
      promo_ad_id: listing.promoAdId,
      unit_cost: listing.unitCost,
      default_postage: listing.defaultPostage,
      transactions_last_30_days: listing.transactionsLast30Days,
      synced_at: syncedAt,
    }));

  const supabase = createSupabaseAdmin();
  for (let index = 0; index < rows.length; index += UPSERT_BATCH) {
    const { error } = await supabase
      .from("ebay_live_listings")
      .upsert(rows.slice(index, index + UPSERT_BATCH), { onConflict: "listing_id" });
    if (error) {
      throw new Error(error.message);
    }
  }

  let removed = 0;
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("ebay_live_listings")
      .delete()
      .lt("synced_at", syncedAt)
      .select("listing_id");
    if (error) {
      throw new Error(error.message);
    }
    removed = data?.length ?? 0;
  }

  return { saved: rows.length, removed };
}

export async function ebayLiveListingsNeedRefresh(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("ebay_live_listings")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.synced_at) {
    return true;
  }

  return Date.now() - Date.parse(data.synced_at) > REFRESH_MS;
}

export async function syncEbayLiveListings(): Promise<{ saved: number; removed: number }> {
  const result = await fetchActiveEbayListings();
  return persistActiveEbayListings(result);
}
