/**
 * Client-safe Amazon listing types + image URL helpers.
 * Keep Node-only report/token code in listings.ts / token-store.ts.
 */

export type AmazonListing = {
  listingId: string;
  sku: string;
  title: string;
  asin: string | null;
  price: number | null;
  quantity: number | null;
  imageUrl: string | null;
  openDate: string | null;
  fulfillmentChannel: string | null;
  condition: string | null;
  productUrl: string | null;
};

/**
 * Constructed /images/P/{ASIN}… URLs usually resolve to a tiny transparent GIF
 * nowadays, so they look like “missing” images in the grid. Prefer real report
 * or Listings Items mainImage URLs instead.
 */
export function isPlaceholderAmazonImageUrl(
  url: string | null | undefined,
): boolean {
  if (!url?.trim()) return true;
  const trimmed = url.trim();
  // Classic broken ASIN guess used by older cache rows.
  if (/\/images\/P\/[A-Z0-9]{10}(\.|$)/i.test(trimmed)) return true;
  return false;
}

export function effectiveAmazonListingImageUrl(
  url: string | null | undefined,
): string | null {
  const trimmed = url?.trim() || null;
  if (!trimmed || isPlaceholderAmazonImageUrl(trimmed)) return null;
  return trimmed;
}
