/** Normalize eBay order IDs so `12-34567-89012` matches `123456789012`. */
export function normalizeEbayOrderIdKey(id: string): string {
  return id.trim().replace(/-/g, "").toUpperCase();
}

/** eBay order ID formats to try with the Finances API orderId filter. */
export function ebayOrderIdLookupVariants(id: string): string[] {
  const trimmed = id.trim();
  if (!trimmed) {
    return [];
  }

  const variants = new Set<string>([trimmed]);
  const normalized = normalizeEbayOrderIdKey(trimmed);
  variants.add(normalized);

  if (/^\d{12}$/.test(normalized)) {
    variants.add(
      `${normalized.slice(0, 2)}-${normalized.slice(2, 7)}-${normalized.slice(7)}`,
    );
  }

  return [...variants];
}
