import type { ShopifyLineItem } from "@/lib/shopify/types";

type LineItemProperty = NonNullable<ShopifyLineItem["properties"]>[number];

function normalizePropertyKey(name: string | null | undefined): string {
  return name?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

/** eBay marketplace SKU from Shopify line item properties. */
export function parseEbaySkuFromProperties(
  properties: LineItemProperty[] | null | undefined,
): string | null {
  for (const prop of properties ?? []) {
    const name = normalizePropertyKey(prop.name);
    const value = prop.value?.trim();
    if (!value) {
      continue;
    }

    if (name === "ebay item sku") {
      return value;
    }
  }

  for (const prop of properties ?? []) {
    const name = normalizePropertyKey(prop.name);
    const value = prop.value?.trim();
    if (!value) {
      continue;
    }

    if (name.includes("ebay") && name.includes("sku")) {
      return value;
    }
  }

  return null;
}

/** Shopify variant SKU, falling back to eBay item SKU from line item properties. */
export function resolveShopifyLineItemSku(item: Pick<ShopifyLineItem, "sku" | "properties">): string | null {
  const sku = item.sku?.trim();
  if (sku) {
    return sku;
  }

  return parseEbaySkuFromProperties(item.properties);
}
