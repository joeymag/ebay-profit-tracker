import { amazonFetch } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import {
  effectiveAmazonListingImageUrl,
  fetchAmazonListings,
  type AmazonListing,
} from "@/lib/amazon/listings";
import { resolveAmazonSellerId } from "@/lib/amazon/pricing";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Json } from "@/lib/supabase/database.types";

const UPSERT_BATCH = 100;
const LOOKUP_BATCH = 20;

export type AmazonListingParentage = "parent" | "child" | "standalone";

export type AmazonListingRow = {
  sku: string;
  marketplace_id: string;
  asin: string | null;
  listing_id: string | null;
  parent_sku: string | null;
  parentage: AmazonListingParentage;
  child_skus: string[];
  product_type: string | null;
  title: string | null;
  description: string | null;
  bullet_points: string[];
  generic_keywords: string | null;
  image_urls: string[];
  price: number | null;
  quantity: number | null;
  fulfillment_channel: string | null;
  condition: string | null;
  status: string | null;
  product_url: string | null;
  raw_attributes: Json;
  updated_at: string;
  synced_at: string;
};

type AttributeValue = Record<string, unknown>;

type ListingsItemResponse = {
  sku?: string;
  summaries?: Array<{
    marketplaceId?: string;
    asin?: string;
    productType?: string;
    itemName?: string;
    status?: string[];
    mainImage?: { link?: string };
  }>;
  attributes?: Record<string, AttributeValue[] | undefined>;
  relationships?: Array<{
    marketplaceId?: string;
    type?: string;
    parentSkus?: string[];
    childSkus?: string[];
    relationships?: Array<{
      type?: string;
      parentSkus?: string[];
      childSkus?: string[];
    }>;
  }>;
};

type SearchListingsResponse = {
  items?: ListingsItemResponse[];
  pagination?: { nextToken?: string };
};

function firstText(values: AttributeValue[] | undefined): string {
  if (!values?.length) return "";
  const raw = values[0]?.value;
  return typeof raw === "string" ? raw : "";
}

function allText(values: AttributeValue[] | undefined): string[] {
  if (!values?.length) return [];
  return values
    .map((entry) => (typeof entry.value === "string" ? entry.value.trim() : ""))
    .filter(Boolean);
}

function mediaUrl(values: AttributeValue[] | undefined): string | null {
  if (!values?.length) return null;
  const raw = values[0]?.media_location;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function collectImageUrls(item: ListingsItemResponse): string[] {
  const urls: string[] = [];
  const push = (url: string | null | undefined) => {
    const cleaned = effectiveAmazonListingImageUrl(url);
    if (cleaned && !urls.includes(cleaned)) urls.push(cleaned);
  };

  push(item.summaries?.[0]?.mainImage?.link);
  const attributes = item.attributes ?? {};
  push(mediaUrl(attributes.main_product_image_locator));
  for (let index = 1; index <= 8; index += 1) {
    push(mediaUrl(attributes[`other_product_image_locator_${index}`]));
  }
  return urls;
}

function relationshipMeta(item: ListingsItemResponse): {
  parentSku: string | null;
  childSkus: string[];
  parentage: AmazonListingParentage;
} {
  const edges: Array<{
    type?: string;
    parentSkus?: string[];
    childSkus?: string[];
  }> = [];

  for (const wrapper of item.relationships ?? []) {
    if (wrapper.relationships?.length) {
      edges.push(...wrapper.relationships);
      continue;
    }
    if (
      (wrapper.childSkus?.length ?? 0) > 0 ||
      (wrapper.parentSkus?.length ?? 0) > 0 ||
      wrapper.type
    ) {
      edges.push(wrapper);
    }
  }

  const rel =
    edges.find((edge) => (edge.type ?? "VARIATION").toUpperCase() === "VARIATION") ??
    edges[0];

  let parentSku = rel?.parentSkus?.[0]?.trim() || null;
  const childSkus = (rel?.childSkus ?? [])
    .map((sku) => sku.trim())
    .filter(Boolean);

  const parentAttr = item.attributes?.child_parent_sku_relationship;
  if (!parentSku && parentAttr?.length) {
    for (const row of parentAttr) {
      const value =
        (typeof row.parent_sku === "string" && row.parent_sku.trim()) ||
        (typeof row.parentSku === "string" && row.parentSku.trim()) ||
        "";
      if (value) {
        parentSku = value;
        break;
      }
    }
  }

  if (parentSku) return { parentSku, childSkus, parentage: "child" };
  if (childSkus.length > 0) {
    return { parentSku: null, childSkus, parentage: "parent" };
  }
  return { parentSku: null, childSkus: [], parentage: "standalone" };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchListingItemsBySku(
  sellerId: string,
  marketplaceId: string,
  skus: string[],
): Promise<Map<string, ListingsItemResponse>> {
  const bySku = new Map<string, ListingsItemResponse>();

  for (let offset = 0; offset < skus.length; offset += LOOKUP_BATCH) {
    const batch = skus.slice(offset, offset + LOOKUP_BATCH);
    if (offset > 0) await wait(350);
    try {
      const data = await amazonFetch<SearchListingsResponse>({
        path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}`,
        query: {
          marketplaceIds: marketplaceId,
          identifiers: batch.join(","),
          identifiersType: "SKU",
          includedData: "summaries,attributes,relationships",
          pageSize: String(Math.min(20, batch.length)),
        },
      });
      for (const item of data.items ?? []) {
        const sku = item.sku?.trim();
        if (sku) bySku.set(sku, item);
      }
    } catch (error) {
      console.error(
        "[amazon-listings-store] batch lookup failed",
        batch.length,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return bySku;
}

export function amazonListingRowToGridListing(
  row: AmazonListingRow,
): AmazonListing & {
  parentSku: string | null;
  parentage: AmazonListingParentage;
} {
  return {
    listingId: row.listing_id || row.sku,
    sku: row.sku,
    title: row.title || row.sku,
    asin: row.asin,
    price: row.price,
    quantity: row.quantity,
    imageUrl:
      effectiveAmazonListingImageUrl(row.image_urls[0]) ||
      row.image_urls[0] ||
      null,
    openDate: null,
    fulfillmentChannel: row.fulfillment_channel,
    condition: row.condition,
    productUrl: row.product_url,
    parentSku: row.parent_sku,
    parentage: row.parentage,
  };
}

export async function loadAmazonListingsFromDb(marketplaceId?: string): Promise<{
  listings: Array<
    AmazonListing & {
      parentSku: string | null;
      parentage: AmazonListingParentage;
    }
  >;
  rows: AmazonListingRow[];
  fetchedAt: string | null;
  marketplaceId: string;
}> {
  const config = getAmazonConfig();
  const market = marketplaceId || config.marketplaceId;
  if (!isSupabaseConfigured()) {
    return {
      listings: [],
      rows: [],
      fetchedAt: null,
      marketplaceId: market,
    };
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("amazon_listings")
    .select("*")
    .eq("marketplace_id", market)
    .order("title", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as AmazonListingRow[];
  const fetchedAt =
    rows
      .map((row) => row.synced_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return {
    listings: rows.map(amazonListingRowToGridListing),
    rows,
    fetchedAt,
    marketplaceId: market,
  };
}

export async function persistAmazonListingRows(
  rows: AmazonListingRow[],
): Promise<{ saved: number; removed: number }> {
  if (!isSupabaseConfigured()) {
    return { saved: 0, removed: 0 };
  }
  if (rows.length === 0) {
    return { saved: 0, removed: 0 };
  }

  const supabase = createSupabaseAdmin();
  const syncedAt = rows[0]?.synced_at || new Date().toISOString();

  for (let index = 0; index < rows.length; index += UPSERT_BATCH) {
    const chunk = rows.slice(index, index + UPSERT_BATCH);
    const { error } = await supabase.from("amazon_listings").upsert(chunk, {
      onConflict: "sku",
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  const marketplaceId = rows[0]!.marketplace_id;
  const { data, error } = await supabase
    .from("amazon_listings")
    .delete()
    .eq("marketplace_id", marketplaceId)
    .lt("synced_at", syncedAt)
    .select("sku");
  if (error) {
    throw new Error(error.message);
  }

  return { saved: rows.length, removed: data?.length ?? 0 };
}

export type AmazonListingsBackfillResult = {
  ok: true;
  marketplaceId: string;
  reportCount: number;
  enrichedCount: number;
  saved: number;
  removed: number;
  withImages: number;
  fetchedAt: string;
};

/**
 * Full catalog backfill:
 * 1) Merchant listings inventory report (price/qty/SKU set)
 * 2) Listings Items batches for images + content + relationships
 * 3) Upsert into public.amazon_listings
 */
export async function backfillAmazonListings(options?: {
  forceRefreshReport?: boolean;
}): Promise<AmazonListingsBackfillResult> {
  const config = getAmazonConfig();
  const report = await fetchAmazonListings({
    forceRefresh: options?.forceRefreshReport === true,
    fast: options?.forceRefreshReport !== true,
  });

  const skus = [
    ...new Set(report.listings.map((listing) => listing.sku.trim()).filter(Boolean)),
  ];
  const sellerId = await resolveAmazonSellerId(skus[0]);
  const itemsBySku = await fetchListingItemsBySku(
    sellerId,
    report.marketplaceId,
    skus,
  );

  const syncedAt = new Date().toISOString();
  const rows: AmazonListingRow[] = [];

  for (const listing of report.listings) {
    const sku = listing.sku.trim();
    if (!sku) continue;
    const item = itemsBySku.get(sku);
    const summary = item?.summaries?.[0];
    const attributes = item?.attributes ?? {};
    const rel = item
      ? relationshipMeta(item)
      : { parentSku: null, childSkus: [] as string[], parentage: "standalone" as const };

    const imageUrls = item
      ? collectImageUrls(item)
      : effectiveAmazonListingImageUrl(listing.imageUrl)
        ? [listing.imageUrl!]
        : [];

    const title =
      firstText(attributes.item_name) ||
      summary?.itemName?.trim() ||
      listing.title ||
      sku;
    const bullets = allText(attributes.bullet_point);

    rows.push({
      sku,
      marketplace_id: report.marketplaceId,
      asin: summary?.asin?.trim() || listing.asin,
      listing_id: listing.listingId || sku,
      parent_sku: rel.parentSku,
      parentage: rel.parentage,
      child_skus: rel.childSkus,
      product_type: summary?.productType?.trim() || null,
      title,
      description: firstText(attributes.product_description) || null,
      bullet_points: bullets,
      generic_keywords: firstText(attributes.generic_keyword) || null,
      image_urls: imageUrls,
      price: listing.price,
      quantity: listing.quantity,
      fulfillment_channel: listing.fulfillmentChannel,
      condition: listing.condition,
      status: summary?.status?.[0] ?? null,
      product_url: listing.productUrl,
      raw_attributes: (attributes as Json) || {},
      updated_at: syncedAt,
      synced_at: syncedAt,
    });
  }

  // Ensure parent rows known only via relationships still exist for grouping.
  for (const row of [...rows]) {
    if (row.parentage !== "parent") continue;
    for (const childSku of row.child_skus) {
      const child = rows.find((entry) => entry.sku === childSku);
      if (child && !child.parent_sku) {
        child.parent_sku = row.sku;
        child.parentage = "child";
      }
    }
  }

  const { saved, removed } = await persistAmazonListingRows(rows);

  return {
    ok: true,
    marketplaceId: report.marketplaceId,
    reportCount: report.listings.length,
    enrichedCount: itemsBySku.size,
    saved,
    removed,
    withImages: rows.filter((row) => row.image_urls.length > 0).length,
    fetchedAt: syncedAt,
  };
}
