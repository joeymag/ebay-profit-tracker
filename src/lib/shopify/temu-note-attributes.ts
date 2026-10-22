import type { ShopifyNoteAttribute } from "@/lib/shopify/types";

function normalizeAttributeKey(name: string | null | undefined): string {
  return name?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

export function parseTemuOrderIdFromNoteAttributes(
  noteAttributes: ShopifyNoteAttribute[] | null | undefined,
): string | null {
  for (const attribute of noteAttributes ?? []) {
    const key = normalizeAttributeKey(attribute.name);
    const value = attribute.value?.trim();
    if (!value) continue;
    if (
      key === "temu order id" ||
      key === "temu order number" ||
      key === "temu parent order sn" ||
      (key.includes("temu") && key.includes("order"))
    ) {
      return value;
    }
  }
  return null;
}

/** Recover a Temu parent order id from Shopify tags when note attributes are missing. */
export function parseTemuOrderIdFromTags(tags: string | null | undefined): string | null {
  if (!tags?.trim()) return null;
  for (const tag of tags.split(",").map((part) => part.trim())) {
    const match = /^temu-order-(.+)$/i.exec(tag);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}
