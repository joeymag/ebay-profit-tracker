import {
  daysInclusive,
  periodBoundsToYmd,
} from "@/lib/ebay/analytics-date-range";
import { fetchBrowseItemByLegacyId } from "@/lib/ebay/browse-client";
import { getEbayConfig } from "@/lib/ebay/config";
import { updateInventoryItemTitle } from "@/lib/ebay/inventory-client";
import { fetchListingTrafficMetrics } from "@/lib/ebay/listing-traffic-metrics";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type TitlePeriodMetrics = {
  searchImpressions: number | null;
  views: number | null;
  transactions: number | null;
  clickThroughRate: number | null;
  salesConversionRate: number | null;
  daysTracked: number;
};

export type TitlePeriodRecord = {
  id: string;
  listingId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  notes: string | null;
  appliedToEbay: boolean;
  ebayUpdateError: string | null;
  startedAt: string;
  endedAt: string | null;
  metrics: TitlePeriodMetrics;
};

export type TitlePeriodComparison = {
  previousPeriodId: string;
  currentPeriodId: string;
  salesDelta: number | null;
  viewsDelta: number | null;
  impressionsDelta: number | null;
  ctrDelta: number | null;
};

export type ListingTitleExperiment = {
  listingId: string;
  marketplaceId: string;
  currentListing: {
    title: string | null;
    imageUrl: string | null;
    price: number | null;
    currency: string | null;
    sku: string | null;
    quantityAvailable: number | null;
    availabilityStatus: string | null;
    itemWebUrl: string | null;
  };
  periods: TitlePeriodRecord[];
  comparisons: TitlePeriodComparison[];
};

type PeriodRow = {
  id: string;
  listing_id: string;
  title: string;
  sku: string | null;
  image_url: string | null;
  notes: string | null;
  applied_to_ebay: boolean;
  ebay_update_error: string | null;
  started_at: string;
  ended_at: string | null;
};

function delta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) {
    return null;
  }

  return current - previous;
}

async function metricsForPeriod(period: PeriodRow): Promise<TitlePeriodMetrics> {
  const { startYmd, endYmd } = periodBoundsToYmd(
    period.started_at,
    period.ended_at,
  );
  const traffic = await fetchListingTrafficMetrics(
    period.listing_id,
    startYmd,
    endYmd,
  );

  return {
    searchImpressions: traffic?.searchImpressions ?? null,
    views: traffic?.views ?? null,
    transactions: traffic?.transactions ?? null,
    clickThroughRate: traffic?.clickThroughRate ?? null,
    salesConversionRate: traffic?.salesConversionRate ?? null,
    daysTracked: daysInclusive(startYmd, endYmd),
  };
}

async function ensureInitialPeriod(
  listingId: string,
  title: string | null,
  sku: string | null,
  imageUrl: string | null,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const { data: existing, error } = await supabase
    .from("ebay_listing_title_periods")
    .select("id")
    .eq("listing_id", listingId)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  if (existing?.length) {
    return;
  }

  const { error: insertError } = await supabase
    .from("ebay_listing_title_periods")
    .insert({
      listing_id: listingId,
      title: title?.trim() || `Listing ${listingId}`,
      sku,
      image_url: imageUrl,
      notes: "Tracking started automatically from current eBay title.",
      applied_to_ebay: false,
    });

  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function getListingTitleExperiment(
  listingId: string,
): Promise<ListingTitleExperiment> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is required for title experiments.");
  }

  const normalizedId = listingId.trim();
  const { marketplaceId } = getEbayConfig();
  const browse = await fetchBrowseItemByLegacyId(normalizedId, marketplaceId);

  await ensureInitialPeriod(
    normalizedId,
    browse?.title ?? null,
    browse?.sku ?? null,
    browse?.imageUrl ?? null,
  );

  const supabase = createSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("ebay_listing_title_periods")
    .select("*")
    .eq("listing_id", normalizedId)
    .order("started_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const periods: TitlePeriodRecord[] = [];
  for (const row of rows ?? []) {
    periods.push({
      id: row.id,
      listingId: row.listing_id,
      title: row.title,
      sku: row.sku,
      imageUrl: row.image_url,
      notes: row.notes,
      appliedToEbay: row.applied_to_ebay,
      ebayUpdateError: row.ebay_update_error,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      metrics: await metricsForPeriod(row),
    });
  }

  const comparisons: TitlePeriodComparison[] = [];
  for (let index = 1; index < periods.length; index += 1) {
    const previous = periods[index - 1]!;
    const current = periods[index]!;
    comparisons.push({
      previousPeriodId: previous.id,
      currentPeriodId: current.id,
      salesDelta: delta(
        current.metrics.transactions,
        previous.metrics.transactions,
      ),
      viewsDelta: delta(current.metrics.views, previous.metrics.views),
      impressionsDelta: delta(
        current.metrics.searchImpressions,
        previous.metrics.searchImpressions,
      ),
      ctrDelta: delta(
        current.metrics.clickThroughRate,
        previous.metrics.clickThroughRate,
      ),
    });
  }

  return {
    listingId: normalizedId,
    marketplaceId,
    currentListing: {
      title: browse?.title ?? null,
      imageUrl: browse?.imageUrl ?? null,
      price: browse?.price ?? null,
      currency: browse?.currency ?? null,
      sku: browse?.sku ?? null,
      quantityAvailable: browse?.quantityAvailable ?? null,
      availabilityStatus: browse?.availabilityStatus ?? null,
      itemWebUrl: browse?.itemWebUrl ?? null,
    },
    periods,
    comparisons,
  };
}

export async function saveListingTitleChange(input: {
  listingId: string;
  title: string;
  notes?: string;
  sku?: string | null;
  imageUrl?: string | null;
  applyToEbay?: boolean;
}): Promise<{ period: TitlePeriodRecord; ebayUpdateError: string | null }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is required for title experiments.");
  }

  const listingId = input.listingId.trim();
  const title = input.title.trim();
  if (!title) {
    throw new Error("Title is required.");
  }

  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: activeRows, error: activeError } = await supabase
    .from("ebay_listing_title_periods")
    .select("*")
    .eq("listing_id", listingId)
    .is("ended_at", null)
    .limit(1);

  if (activeError) {
    throw new Error(activeError.message);
  }

  const active = activeRows?.[0] as PeriodRow | undefined;
  if (active && active.title.trim() === title) {
    throw new Error("This title is already the active tracked title.");
  }

  if (active) {
    const { error: closeError } = await supabase
      .from("ebay_listing_title_periods")
      .update({ ended_at: now })
      .eq("id", active.id);

    if (closeError) {
      throw new Error(closeError.message);
    }
  }

  let appliedToEbay = false;
  let ebayUpdateError: string | null = null;
  const sku = input.sku?.trim() || active?.sku?.trim() || null;

  if (input.applyToEbay !== false && sku) {
    const result = await updateInventoryItemTitle(sku, title);
    appliedToEbay = result.ok;
    if (!result.ok) {
      ebayUpdateError = result.error;
    }
  } else if (input.applyToEbay !== false && !sku) {
    ebayUpdateError =
      "No SKU linked to this listing — title saved for tracking only. Update on eBay manually or reconnect with Inventory API access.";
  }

  const { data: inserted, error: insertError } = await supabase
    .from("ebay_listing_title_periods")
    .insert({
      listing_id: listingId,
      title,
      sku,
      image_url: input.imageUrl ?? active?.image_url ?? null,
      notes: input.notes?.trim() || null,
      applied_to_ebay: appliedToEbay,
      ebay_update_error: ebayUpdateError,
      started_at: now,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Could not save title period.");
  }

  const period: TitlePeriodRecord = {
    id: inserted.id,
    listingId: inserted.listing_id,
    title: inserted.title,
    sku: inserted.sku,
    imageUrl: inserted.image_url,
    notes: inserted.notes,
    appliedToEbay: inserted.applied_to_ebay,
    ebayUpdateError: inserted.ebay_update_error,
    startedAt: inserted.started_at,
    endedAt: inserted.ended_at,
    metrics: await metricsForPeriod(inserted),
  };

  return { period, ebayUpdateError };
}
