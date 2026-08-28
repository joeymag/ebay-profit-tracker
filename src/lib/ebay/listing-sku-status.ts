export function listingSkuIsMissing(
  sku: string | null | undefined,
  listingId: string,
): boolean {
  const trimmedSku = sku?.trim();
  if (!trimmedSku) {
    return true;
  }

  return trimmedSku === listingId.trim();
}

export function activeListingNeedsSku(listing: {
  sku: string;
  listingId: string | null;
}): boolean {
  const listingId = listing.listingId?.trim();
  if (!listingId) {
    return false;
  }

  return listingSkuIsMissing(listing.sku, listingId);
}

export function variationRowNeedsSku(
  draftSku: string,
  variationSku: string | null | undefined,
  listingId: string,
): boolean {
  const effective = draftSku.trim() || variationSku?.trim() || "";
  return listingSkuIsMissing(effective || null, listingId);
}
