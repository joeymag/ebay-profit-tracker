import { getSalesChannel } from "@/lib/orders/channel";

const EBAY_USERNAME_PATTERN = /\(([^)]+)\)\s*$/;

/** eBay buyer id from Shopify buyer name, e.g. "Jane Doe (janedoe123)". */
export function extractEbayUsername(
  buyerName: string | null | undefined,
): string | null {
  if (!buyerName?.trim()) {
    return null;
  }

  const match = buyerName.trim().match(EBAY_USERNAME_PATTERN);
  return match?.[1]?.trim() || null;
}

export function normalizeEbayUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function extractEbayDisplayName(
  buyerName: string | null | undefined,
): string | null {
  if (!buyerName?.trim()) {
    return null;
  }

  const withoutUsername = buyerName
    .trim()
    .replace(/\s*\([^)]+\)\s*$/, "")
    .trim();

  return withoutUsername || null;
}

export function resolveEbayUsername(order: {
  ebayUsername?: string | null;
  buyerName: string | null;
  tags: string | null;
}): string | null {
  if (order.ebayUsername?.trim()) {
    return order.ebayUsername.trim();
  }

  if (getSalesChannel(order.tags) !== "eBay") {
    return null;
  }

  return extractEbayUsername(order.buyerName);
}

export function parseEbayUsernameForOrder(order: {
  buyerName: string | null;
  tags: string | null;
}): string | null {
  if (getSalesChannel(order.tags) !== "eBay") {
    return null;
  }

  const username = extractEbayUsername(order.buyerName);
  return username ? normalizeEbayUsername(username) : null;
}
