export type LineItemProperty = {
  name?: string | null;
  value?: string | null;
};

/** Temu marketplace SKU from Shopify line item properties. */
export function parseTemuSkuFromProperties(
  properties: LineItemProperty[] | null | undefined,
): string | null {
  for (const prop of properties ?? []) {
    const name = prop.name?.trim().toLowerCase() ?? "";
    const value = prop.value?.trim();
    if (!value) {
      continue;
    }

    if (name === "temu item sku id") {
      return value;
    }
  }

  return null;
}

/** Internal catalog SKU key for Temu-only products. */
export function catalogSkuForTemu(temuSku: string): string {
  return `TEMU:${temuSku.trim()}`;
}
