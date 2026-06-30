/** Shopify placeholder when marketplace hides buyer identity on the address. */
const PLACEHOLDER_BUYER_NAMES = new Set([
  "anonymous customer",
  "anonymous",
  "guest",
  "guest customer",
]);

export function isPlaceholderBuyerName(
  name: string | null | undefined,
): boolean {
  if (!name?.trim()) {
    return false;
  }

  return PLACEHOLDER_BUYER_NAMES.has(name.trim().toLowerCase());
}

export function firstUsableBuyerName(
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && !isPlaceholderBuyerName(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Sticky customer contact merge on sync: name, eBay username, and (via
 * mergeShippingAddressOnSync) address + phone must not be downgraded by Shopify
 * placeholders or empty marketplace payloads. Upgrades are allowed.
 */
export function mergeBuyerIdentityOnSync(
  previous:
    | {
        buyer_name?: string | null;
        ebay_username?: string | null;
      }
    | undefined,
  incoming: {
    buyerName: string | null;
    ebayUsername: string | null;
    tags: string | null;
    parseEbayUsername: (order: {
      buyerName: string | null;
      tags: string | null;
    }) => string | null;
  },
): { buyerName: string | null; ebayUsername: string | null } {
  const prevName = previous?.buyer_name?.trim() || null;
  const prevUsername = previous?.ebay_username?.trim() || null;
  let buyerName = incoming.buyerName?.trim() || null;
  let ebayUsername = incoming.ebayUsername?.trim() || null;

  const hadGoodName = Boolean(prevName && !isPlaceholderBuyerName(prevName));
  const incomingIsPlaceholder = isPlaceholderBuyerName(buyerName);
  const incomingIsWorse = !buyerName || incomingIsPlaceholder;

  if (hadGoodName && incomingIsWorse) {
    buyerName = prevName;
  }

  if (prevUsername && (!ebayUsername || incomingIsWorse)) {
    ebayUsername = prevUsername;
  }

  if (!ebayUsername && buyerName && !isPlaceholderBuyerName(buyerName)) {
    ebayUsername = incoming.parseEbayUsername({
      buyerName,
      tags: incoming.tags,
    });
  }

  return { buyerName, ebayUsername };
}
