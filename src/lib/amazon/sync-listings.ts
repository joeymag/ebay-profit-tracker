import { getAmazonConfig } from "@/lib/amazon/config";
import {
  backfillAmazonListings,
} from "@/lib/amazon/amazon-listings-store";
import {
  fetchAmazonListingContent,
  fetchAmazonListingFamilyBySku,
  type AmazonListingContent,
} from "@/lib/amazon/listing-editor";
import { fetchAmazonListings } from "@/lib/amazon/listings";
import {
  listingContentToUpsert,
  upsertAmazonListingRows,
  type AmazonListingInsert,
} from "@/lib/amazon/listings-store";
import type { Json } from "@/lib/supabase/database.types";

function preferImageUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const url = candidate?.trim();
    if (!url) continue;
    // ASIN placeholder URLs that Amazon serves as 1×1 GIFs are useless in the UI.
    if (/\/images\/P\/[A-Z0-9]+\.01\._SCLZZZZZZZ_/i.test(url)) continue;
    return url;
  }
  return null;
}

/**
 * Full catalog backfill into public.amazon_listings:
 * inventory report + Listings Items batches (images, SEO, bullets, relationships).
 */
export async function syncAmazonListingsToSupabase(options?: {
  forceRefresh?: boolean;
}): Promise<{
  saved: number;
  removed: number;
  enrichedCount: number;
  withImages: number;
  reportCount: number;
  familyCount: number;
  marketplaceId: string;
  fetchedAt: string;
}> {
  const result = await backfillAmazonListings({
    forceRefreshReport: options?.forceRefresh === true,
  });

  return {
    saved: result.saved,
    removed: result.removed,
    enrichedCount: result.enrichedCount,
    withImages: result.withImages,
    reportCount: result.reportCount,
    familyCount: 0,
    marketplaceId: result.marketplaceId,
    fetchedAt: result.fetchedAt,
  };
}

/**
 * Live-fetch one SKU family from Amazon and overwrite the Supabase rows.
 */
export async function refreshAmazonListingFamilyInSupabase(sku: string): Promise<{
  content: AmazonListingContent;
  family: AmazonListingContent[];
  familySkus: string[];
}> {
  const { content, familySkus } = await fetchAmazonListingFamilyBySku(sku);
  const { marketplaceId } = getAmazonConfig();

  let inventoryBySku = new Map<
    string,
    Awaited<ReturnType<typeof fetchAmazonListings>>["listings"][number]
  >();
  try {
    const inventory = await fetchAmazonListings({ fast: true });
    inventoryBySku = new Map(
      inventory.listings.map((listing) => [listing.sku, listing]),
    );
  } catch {
    inventoryBySku = new Map();
  }

  const familyContents: AmazonListingContent[] = [];
  const rows: AmazonListingInsert[] = [];

  for (const familySku of familySkus) {
    let member =
      familySku === content.sku
        ? content
        : await fetchAmazonListingContent(familySku).catch(() => null);
    if (!member) {
      member = {
        ...content,
        sku: familySku,
        title: familySku,
        description: "",
        bulletPoints: ["", "", "", "", ""],
        genericKeywords: "",
        images: [],
        parentSku:
          content.parentage === "parent" ? content.sku : content.parentSku,
        childSkus: [],
        parentage:
          familySku === content.parentSku || familySku === content.sku
            ? content.parentage === "parent" && familySku === content.sku
              ? "parent"
              : familySku === content.parentSku
                ? "parent"
                : "child"
            : "child",
        status: null,
        asin: null,
      };
    }
    familyContents.push(member);

    const inventory = inventoryBySku.get(familySku);
    const imageUrls = member.images.map((image) => image.url).filter(Boolean);
    const fallbackImage = preferImageUrl(inventory?.imageUrl);
    rows.push(
      listingContentToUpsert(member, {
        marketplace_id: marketplaceId,
        listing_id: inventory?.listingId ?? member.sku,
        price: inventory?.price ?? null,
        quantity: inventory?.quantity ?? null,
        fulfillment_channel: inventory?.fulfillmentChannel ?? null,
        condition: inventory?.condition ?? null,
        product_url: inventory?.productUrl ?? null,
        image_urls:
          imageUrls.length > 0
            ? imageUrls
            : fallbackImage
              ? [fallbackImage]
              : [],
        raw_attributes: {
          refreshedFrom: "listings-items",
          familySkus,
        } as Json,
      }),
    );
  }

  await upsertAmazonListingRows(rows);

  return {
    content: familyContents.find((row) => row.sku === content.sku) ?? content,
    family: familyContents,
    familySkus: familyContents.map((row) => row.sku),
  };
}
