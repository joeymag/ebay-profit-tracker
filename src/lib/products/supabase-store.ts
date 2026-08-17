import { fetchAllLineItemsFromSupabase } from "@/lib/orders/fetch-line-items";
import { resolveLineItemCatalogSku } from "@/lib/orders/line-item-sku";
import { isTemuPrefixedCatalogSku } from "@/lib/orders/temu-sku";
import { fetchAllShopifyCatalogVariants } from "@/lib/shopify/products-catalog";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { Product } from "@/lib/products/types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

const PRODUCTS_PAGE_SIZE = 1000;
const UPSERT_BATCH_SIZE = 200;

function rowToProduct(row: ProductRow, orderLineCount = 0): Product {
  return {
    sku: row.sku,
    title: row.title,
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
    defaultPostage:
      row.default_postage != null ? Number(row.default_postage) : null,
    imageUrl: row.image_url,
    shopifyProductId: row.shopify_product_id,
    temuSku: row.temu_sku,
    updatedAt: row.updated_at,
    orderLineCount,
  };
}

function temuOwnerMap(
  rows: Array<{ sku: string; temu_sku: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const temu = row.temu_sku?.trim();
    if (!temu || isTemuPrefixedCatalogSku(row.sku)) {
      continue;
    }
    if (!map.has(temu)) {
      map.set(temu, row.sku);
    }
  }
  return map;
}

async function fetchAllProductRows<K extends keyof ProductRow>(
  columns: string,
): Promise<Pick<ProductRow, K>[]> {
  const supabase = createSupabaseAdmin();
  const rows: Pick<ProductRow, K>[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select(columns)
      .range(offset, offset + PRODUCTS_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data ?? []) as Pick<ProductRow, K>[];
    rows.push(...batch);
    if (batch.length < PRODUCTS_PAGE_SIZE) {
      break;
    }
    offset += PRODUCTS_PAGE_SIZE;
  }

  return rows;
}

async function getOrderLineCountsBySku(
  temuToSku: Map<string, string>,
): Promise<Map<string, number>> {
  const data = await fetchAllLineItemsFromSupabase();
  const counts = new Map<string, number>();
  for (const row of data) {
    const shopifySku = row.sku?.trim();
    if (shopifySku && !isTemuPrefixedCatalogSku(shopifySku)) {
      counts.set(shopifySku, (counts.get(shopifySku) ?? 0) + 1);
      continue;
    }

    const temuSku = row.temu_sku?.trim();
    if (temuSku) {
      const owner = temuToSku.get(temuSku);
      if (owner) {
        counts.set(owner, (counts.get(owner) ?? 0) + 1);
        continue;
      }
    }

    const fallback = resolveLineItemCatalogSku(row.sku, row.title);
    if (fallback && !isTemuPrefixedCatalogSku(fallback)) {
      counts.set(fallback, (counts.get(fallback) ?? 0) + 1);
    }
  }
  return counts;
}

export async function getProductsFromSupabase(): Promise<Product[]> {
  const rows = await fetchAllProductRows<keyof ProductRow>("*");
  const lineCounts = await getOrderLineCountsBySku(temuOwnerMap(rows));

  return rows.map((row) =>
    rowToProduct(row as ProductRow, lineCounts.get(row.sku) ?? 0),
  );
}

export async function getProductCatalogFromSupabase(): Promise<
  { sku: string; unitCost: number | null }[]
> {
  const rows = await fetchAllProductRows<"sku" | "unit_cost" | "temu_sku">(
    "sku, unit_cost, temu_sku",
  );

  return rows.map((row) => ({
    sku: row.sku,
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
    temuSku: row.temu_sku,
  }));
}

export async function updateProductCostInSupabase(
  sku: string,
  unitCost: number | null,
): Promise<Product> {
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("products")
    .update({
      unit_cost: unitCost,
      updated_at: new Date().toISOString(),
    })
    .eq("sku", sku)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const lineCounts = await getOrderLineCountsBySku(
    temuOwnerMap([{ sku: data.sku, temu_sku: data.temu_sku }]),
  );
  return rowToProduct(data, lineCounts.get(sku) ?? 0);
}

export async function syncProductsFromShopifyInSupabase(): Promise<{
  imported: number;
  updated: number;
  removed: number;
  total: number;
}> {
  const supabase = createSupabaseAdmin();
  const shopifyVariants = await fetchAllShopifyCatalogVariants();
  const shopifySkus = new Set(shopifyVariants.map((variant) => variant.sku));

  const existing = await fetchAllProductRows<
    "sku" | "unit_cost" | "default_postage" | "temu_sku"
  >("sku, unit_cost, default_postage, temu_sku");
  const existingBySku = new Map(existing.map((row) => [row.sku, row]));

  const now = new Date().toISOString();
  const rows: ProductInsert[] = [];
  let imported = 0;
  let updated = 0;

  for (const variant of shopifyVariants) {
    const previous = existingBySku.get(variant.sku);
    if (!previous) {
      imported += 1;
    } else {
      updated += 1;
    }

    rows.push({
      sku: variant.sku,
      title: variant.title,
      image_url: variant.imageUrl,
      shopify_product_id: variant.shopifyProductId,
      unit_cost: previous?.unit_cost ?? null,
      default_postage: previous?.default_postage ?? null,
      temu_sku: previous?.temu_sku ?? null,
      updated_at: now,
    });
  }

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "sku" });

    if (error) {
      throw new Error(error.message);
    }
  }

  const staleSkus = existing
    .map((row) => row.sku)
    .filter((sku) => !shopifySkus.has(sku));

  if (staleSkus.length) {
    for (let i = 0; i < staleSkus.length; i += UPSERT_BATCH_SIZE) {
      const batch = staleSkus.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase.from("products").delete().in("sku", batch);
      if (error) {
        throw new Error(error.message);
      }
    }
  }

  const total = await getProductsFromSupabase();
  return {
    imported,
    updated,
    removed: staleSkus.length,
    total: total.length,
  };
}
