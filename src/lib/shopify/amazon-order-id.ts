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

export function parseAmazonOrderIdFromNoteAttributes(
  noteAttributes: ShopifyNoteAttribute[] | null | undefined,
): string | null {
  return readNoteAttribute(noteAttributes, [
    "Amazon Order Id",
    "Amazon Order Number",
  ]);
}

/** Amazon "Deliver by" deadline from note attributes. */
export function parseAmazonDeliverByAtFromNoteAttributes(
  noteAttributes: ShopifyNoteAttribute[] | null | undefined,
): string | null {
  return parseIsoTimestamp(
    readNoteAttribute(noteAttributes, ["Amazon Latest Delivery Date"]),
  );
}

export function amazonSellerCentralOrderUrl(
  amazonOrderId: string,
  countryCode = "GB",
): string {
  const host =
    countryCode.toUpperCase() === "GB"
      ? "sellercentral.amazon.co.uk"
      : "sellercentral.amazon.com";

  return `https://${host}/orders-v3/order/${encodeURIComponent(amazonOrderId)}`;
}
