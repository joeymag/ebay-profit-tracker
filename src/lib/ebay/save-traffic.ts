import { toLondonYmd } from "@/lib/ebay/analytics-date-range";
import { fetchListingTrafficReport } from "@/lib/ebay/traffic-report";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const HISTORY_DAYS = 90;
const DAYS_PER_RUN = 3;

function addYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eachYmd(startYmd: string, endYmd: string): string[] {
  const days: string[] = [];
  for (let ymd = startYmd; ymd <= endYmd; ymd = addYmd(ymd, 1)) {
    days.push(ymd);
  }
  return days;
}

export async function saveEbayTrafficHistory(options?: {
  maxDays?: number;
}): Promise<{ savedDays: string[]; listingRows: number; pendingDays: number }> {
  if (!isSupabaseConfigured()) {
    return { savedDays: [], listingRows: 0, pendingDays: 0 };
  }

  const yesterday = addYmd(toLondonYmd(new Date()), -1);
  const earliest = addYmd(yesterday, -(HISTORY_DAYS - 1));
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("ebay_listing_traffic_sync")
    .select("metric_date")
    .gte("metric_date", earliest)
    .lte("metric_date", yesterday);

  if (error) {
    throw new Error(error.message);
  }

  const saved = new Set((data ?? []).map((row) => String(row.metric_date).slice(0, 10)));
  const missing = eachYmd(earliest, yesterday).filter((ymd) => !saved.has(ymd));
  const batch = missing.slice(0, options?.maxDays ?? DAYS_PER_RUN);
  const savedDays: string[] = [];
  let listingRows = 0;

  for (const day of batch) {
    const report = await fetchListingTrafficReport({
      startYmd: day,
      endYmd: addYmd(day, 1),
    });
    const rows = report.listings.map((listing) => ({
      listing_id: listing.listingId,
      metric_date: day,
      marketplace_id: report.marketplaceId,
      title: listing.title,
      search_impressions: listing.searchImpressions,
      total_impressions: listing.totalImpressions,
      all_impressions: listing.allImpressions,
      views: listing.views,
      click_through_rate: listing.clickThroughRate,
      transactions: listing.transactions,
      sales_conversion_rate: listing.salesConversionRate,
      fetched_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("ebay_listing_traffic_days")
        .upsert(rows, { onConflict: "listing_id,metric_date" });
      if (upsertError) {
        throw new Error(upsertError.message);
      }
    }

    const { error: syncError } = await supabase.from("ebay_listing_traffic_sync").upsert(
      {
        metric_date: day,
        listing_count: rows.length,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "metric_date" },
    );
    if (syncError) {
      throw new Error(syncError.message);
    }

    savedDays.push(day);
    listingRows += rows.length;
  }

  return {
    savedDays,
    listingRows,
    pendingDays: Math.max(0, missing.length - savedDays.length),
  };
}
