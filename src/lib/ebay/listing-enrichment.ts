import { fetchBrowseItemsByLegacyIds } from "@/lib/ebay/browse-client";
import type { ListingTrafficRow } from "@/lib/ebay/traffic-report-types";

export async function enrichListingTrafficRows(
  rows: ListingTrafficRow[],
  marketplaceId: string,
): Promise<ListingTrafficRow[]> {
  if (!rows.length) {
    return rows;
  }

  const detailsByListingId = await fetchBrowseItemsByLegacyIds(
    rows.map((row) => row.listingId),
    marketplaceId,
  );

  return rows.map((row) => {
    const details = detailsByListingId.get(row.listingId);
    if (!details) {
      return row;
    }

    return {
      ...row,
      title: details.title ?? row.title,
      imageUrl: details.imageUrl,
      price: details.price,
      currency: details.currency,
      condition: details.condition,
      quantityAvailable: details.quantityAvailable,
      availabilityStatus: details.availabilityStatus,
      itemWebUrl: details.itemWebUrl,
      sku: details.sku,
    };
  });
}
