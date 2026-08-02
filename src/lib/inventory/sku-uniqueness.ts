import { randomBytes } from "crypto";

import { createSupabaseAdmin } from "@/lib/supabase/client";
import { lookupAllStockBySku } from "@/lib/shopify/inventory";

const SKU_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeSkuKey(sku: string): string {
  return sku.trim().toUpperCase();
}

function randomSkuSuffix(length = 8): string {
  const bytes = randomBytes(length);
  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += SKU_CHARS[bytes[i]! % SKU_CHARS.length];
  }

  return result;
}

function sanitizePrefix(prefix: string): string {
  const cleaned = prefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return cleaned || "INV";
}

async function isSkuTakenInDatabase(sku: string): Promise<boolean> {
  const key = normalizeSkuKey(sku);
  if (!key) {
    return true;
  }

  const supabase = createSupabaseAdmin();

  const [mastersRes, childrenRes, productsRes] = await Promise.all([
    supabase.from("inventory_masters").select("sku"),
    supabase.from("inventory_child_mappings").select("child_sku"),
    supabase.from("products").select("sku, temu_sku"),
  ]);

  for (const row of mastersRes.data ?? []) {
    if (normalizeSkuKey(row.sku) === key) {
      return true;
    }
  }

  for (const row of childrenRes.data ?? []) {
    if (normalizeSkuKey(row.child_sku) === key) {
      return true;
    }
  }

  for (const row of productsRes.data ?? []) {
    if (normalizeSkuKey(row.sku) === key) {
      return true;
    }
    if (row.temu_sku && normalizeSkuKey(row.temu_sku) === key) {
      return true;
    }
  }

  return false;
}

/** True if SKU exists in Shopify or Supabase inventory/product tables. */
export async function isSkuTaken(
  sku: string,
  options?: { exceptVariantId?: number },
): Promise<boolean> {
  const trimmed = sku.trim();
  if (!trimmed) {
    return true;
  }

  const shopifyMatches = await lookupAllStockBySku(trimmed);
  for (const match of shopifyMatches) {
    if (
      options?.exceptVariantId != null &&
      match.variantId === options.exceptVariantId
    ) {
      continue;
    }
    return true;
  }

  return isSkuTakenInDatabase(trimmed);
}

/** Generate a SKU that is not used in Shopify or the app database. */
export async function suggestUniqueSku(prefix = "INV"): Promise<string> {
  const base = sanitizePrefix(prefix);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = `${base}-${randomSkuSuffix(8)}`;
    if (!(await isSkuTaken(candidate))) {
      return candidate;
    }
  }

  throw new Error("Could not generate a unique SKU. Try again.");
}
