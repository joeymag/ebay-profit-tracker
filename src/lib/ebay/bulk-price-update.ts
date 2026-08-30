import {
  fetchEbayListingDetails,
  reviseEbayListingSkuAndPrice,
  type EbayVariationEdit,
} from "@/lib/ebay/listing-details";
import { applyPricePercentChange } from "@/lib/ebay/price-percent";

export { applyPricePercentChange } from "@/lib/ebay/price-percent";

export type BulkPriceUpdateResult = {
  listingId: string;
  ok: boolean;
  variationCount?: number;
  error?: string;
};

export async function bulkUpdateListingPrices(input: {
  listingIds: string[];
  percentChange: number;
}): Promise<BulkPriceUpdateResult[]> {
  const results: BulkPriceUpdateResult[] = [];

  for (const listingId of input.listingIds) {
    const trimmedId = listingId.trim();
    if (!trimmedId) {
      continue;
    }

    try {
      const listing = await fetchEbayListingDetails(trimmedId);
      const updates: EbayVariationEdit[] = [];

      for (const variation of listing.variations) {
        if (variation.price == null || !Number.isFinite(variation.price)) {
          continue;
        }

        if (listing.isMultiVariation && !variation.specificsPairs.length) {
          throw new Error(
            `Variation "${variation.specifics}" is missing option specifics needed to update eBay.`,
          );
        }

        updates.push({
          originalSku: variation.sku,
          sku: variation.sku,
          price: applyPricePercentChange(variation.price, input.percentChange),
          specificsPairs: variation.specificsPairs,
        });
      }

      if (!updates.length) {
        results.push({
          listingId: trimmedId,
          ok: false,
          error: "No priced variations found on this listing.",
        });
        continue;
      }

      await reviseEbayListingSkuAndPrice({
        listingId: trimmedId,
        isMultiVariation: listing.isMultiVariation,
        format: listing.format,
        currency: listing.currency ?? "GBP",
        variations: updates,
      });

      results.push({
        listingId: trimmedId,
        ok: true,
        variationCount: updates.length,
      });
    } catch (error) {
      results.push({
        listingId: trimmedId,
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not update prices.",
      });
    }
  }

  return results;
}
