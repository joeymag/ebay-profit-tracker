export function normalizeSku(sku: string | null | undefined): string | null {
  const trimmed = sku?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

/** Variant label from the last `[...]` segment in a Shopify line item title. */
export function extractBracketVariantSku(
  title: string | null | undefined,
): string | null {
  if (!title?.trim()) {
    return null;
  }

  const matches = [...title.matchAll(/\[([^\]]+)\]/g)];
  if (!matches.length) {
    return null;
  }

  const variant = matches[matches.length - 1][1].trim();
  return variant || null;
}

/** SKU for display — Shopify SKU, Temu SKU, or bracket variant text as fallback. */
export function resolveLineItemSkuForDisplay(
  sku: string | null | undefined,
  title?: string | null | undefined,
  temuSku?: string | null | undefined,
): string | null {
  const trimmed = sku?.trim();
  if (trimmed) {
    return trimmed;
  }

  const temu = temuSku?.trim();
  if (temu) {
    return temu;
  }

  return extractBracketVariantSku(title);
}

/**
 * Catalog SKU is the Shopify / eBay SKU only.
 * Temu SKU is stored on that product — it is not a second catalog product.
 */
export function resolveLineItemCatalogSku(
  sku: string | null | undefined,
  title?: string | null | undefined,
  _temuSku?: string | null | undefined,
): string | null {
  const trimmed = sku?.trim();
  if (trimmed) {
    return trimmed;
  }

  return extractBracketVariantSku(title);
}

/** Normalized SKU key for catalog lookups (case-insensitive). */
export function resolveLineItemSkuKey(
  sku: string | null | undefined,
  title?: string | null | undefined,
  temuSku?: string | null | undefined,
): string | null {
  return normalizeSku(resolveLineItemCatalogSku(sku, title, temuSku));
}

/** True when SKU comes from title brackets rather than Shopify. */
export function isBracketDerivedSku(
  sku: string | null | undefined,
  title?: string | null | undefined,
): boolean {
  if (sku?.trim()) {
    return false;
  }

  return extractBracketVariantSku(title) != null;
}

export function isTemuDerivedSku(
  sku: string | null | undefined,
  temuSku?: string | null | undefined,
): boolean {
  if (sku?.trim()) {
    return false;
  }

  return Boolean(temuSku?.trim());
}
