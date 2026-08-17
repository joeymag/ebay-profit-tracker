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

/** Legacy catalog SKU for old Temu-only product rows. Do not create new ones. */
export function catalogSkuForTemu(temuSku: string): string {
  return `TEMU:${temuSku.trim()}`;
}

export function isTemuPrefixedCatalogSku(
  sku: string | null | undefined,
): boolean {
  return Boolean(sku?.trim().toUpperCase().startsWith("TEMU:"));
}
