import { suggestUniqueSku } from "@/lib/inventory/sku-uniqueness";
import {
  fetchEbayListingDetails,
  reviseEbayListingSkuAndPrice,
  type EbayVariationEdit,
} from "@/lib/ebay/listing-details";
import { listingSkuIsMissing } from "@/lib/ebay/listing-sku-status";
import { upsertSkuCosts } from "@/lib/products/listing-costs";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type GeneratedListingSku = {
  specifics: string;
  sku: string;
};

export type GenerateListingSkuResult = {
  listingId: string;
  ok: boolean;
  skus?: GeneratedListingSku[];
  error?: string;
};

export async function generateListingSkus(input: {
  listingId: string;
  prefix?: string;
  variationSpecifics?: string[];
}): Promise<GenerateListingSkuResult> {
  const listingId = input.listingId.trim();
  if (!listingId) {
    return { listingId, ok: false, error: "Listing ID is required." };
  }

  const prefix = input.prefix?.trim() || "EBAY";

  try {
    const listing = await fetchEbayListingDetails(listingId);
    const specificsFilter = input.variationSpecifics?.length
      ? new Set(input.variationSpecifics.map((value) => value.trim()).filter(Boolean))
      : null;
    const updates: EbayVariationEdit[] = [];
    const generated: GeneratedListingSku[] = [];

    for (const variation of listing.variations) {
      if (
        specificsFilter &&
        !specificsFilter.has(variation.specifics.trim())
      ) {
        continue;
      }

      if (!listingSkuIsMissing(variation.sku, listingId)) {
        continue;
      }

      if (variation.price == null || !Number.isFinite(variation.price)) {
        return {
          listingId,
          ok: false,
          error: `Variation "${variation.specifics}" is missing a price on eBay.`,
        };
      }

      if (listing.isMultiVariation && !variation.specificsPairs.length) {
        return {
          listingId,
          ok: false,
          error: `Variation "${variation.specifics}" is missing option specifics needed to update eBay.`,
        };
      }

      const sku = await suggestUniqueSku(prefix);
      generated.push({
        specifics: variation.specifics,
        sku,
      });
      updates.push({
        originalSku: variation.sku,
        sku,
        price: variation.price,
        specificsPairs: variation.specificsPairs,
      });
    }

    if (!updates.length) {
      return {
        listingId,
        ok: false,
        error: specificsFilter
          ? "Selected variations already have SKUs."
          : "This listing already has SKUs on all variations.",
      };
    }

    await reviseEbayListingSkuAndPrice({
      listingId,
      isMultiVariation: listing.isMultiVariation,
      format: listing.format,
      currency: listing.currency ?? "GBP",
      variations: updates,
    });

    if (isSupabaseConfigured()) {
      const title = listing.title?.trim() || `Listing ${listingId}`;
      for (const row of generated) {
        try {
          await upsertSkuCosts({
            sku: row.sku,
            title,
          });
        } catch {
          // Catalog sync is best-effort after eBay update.
        }
      }
    }

    return {
      listingId,
      ok: true,
      skus: generated,
    };
  } catch (error) {
    return {
      listingId,
      ok: false,
      error: error instanceof Error ? error.message : "Could not generate SKU.",
    };
  }
}

export async function generateListingSkusBulk(input: {
  listingIds: string[];
  prefix?: string;
}): Promise<GenerateListingSkuResult[]> {
  const results: GenerateListingSkuResult[] = [];

  for (const listingId of input.listingIds) {
    results.push(
      await generateListingSkus({
        listingId,
        prefix: input.prefix,
      }),
    );
  }

  return results;
}
