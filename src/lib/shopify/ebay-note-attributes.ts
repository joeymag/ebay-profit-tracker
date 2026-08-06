import type { ShopifyNoteAttribute } from "@/lib/shopify/types";

function normalizeAttributeKey(name: string | null | undefined): string {
  return name?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function readNoteAttribute(
  noteAttributes: ShopifyNoteAttribute[] | null | undefined,
  keys: string[],
): string | null {
  const normalizedKeys = new Set(keys.map(normalizeAttributeKey));

  for (const attribute of noteAttributes ?? []) {
    const key = normalizeAttributeKey(attribute.name);
    if (!normalizedKeys.has(key)) {
      continue;
    }

    const value = attribute.value?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function parseIsoTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function looksLikeEbayOrderId(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  return /^[\d-]{8,20}$/.test(compact);
}

export function parseEbayOrderIdFromNoteAttributes(
  noteAttributes: ShopifyNoteAttribute[] | null | undefined,
): string | null {
  const direct = readNoteAttribute(noteAttributes, [
    "eBay Order Id",
    "eBay Order ID",
    "eBay Order Number",
    "eBay Order #",
    "ebay order id",
    "ebay order number",
  ]);
  if (direct) {
    return direct;
  }

  for (const attribute of noteAttributes ?? []) {
    const key = normalizeAttributeKey(attribute.name);
    if (!key.includes("ebay") || !key.includes("order")) {
      continue;
    }

    const value = attribute.value?.trim();
    if (value && looksLikeEbayOrderId(value)) {
      return value;
    }
  }

  return null;
}

/** eBay "Deliver by" deadline from note attributes. */
export function parseEbayDeliverByAtFromNoteAttributes(
  noteAttributes: ShopifyNoteAttribute[] | null | undefined,
): string | null {
  return parseIsoTimestamp(
    readNoteAttribute(noteAttributes, ["eBay Latest Delivery Date"]),
  );
}

export function ebaySellerHubOrderUrl(
  ebayOrderId: string,
  countryCode = "GB",
): string {
  const host =
    countryCode.toUpperCase() === "GB" ? "www.ebay.co.uk" : "www.ebay.com";

  return `https://${host}/sh/ord/details?orderid=${encodeURIComponent(ebayOrderId)}`;
}
