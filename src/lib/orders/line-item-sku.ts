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

/** SKU for display and storage — Shopify SKU, or bracket variant text as fallback. */
export function resolveLineItemSkuForDisplay(
  sku: string | null | undefined,
  title?: string | null | undefined,
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
): string | null {
  return normalizeSku(resolveLineItemSkuForDisplay(sku, title));
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
