import { resolveLineItemSkuForDisplay } from "@/lib/orders/line-item-sku";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { Product } from "@/lib/products/types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

function rowToProduct(row: ProductRow, orderLineCount = 0): Product {
  return {
    sku: row.sku,
    title: row.title,
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
    imageUrl: row.image_url,
    shopifyProductId: row.shopify_product_id,
    updatedAt: row.updated_at,
    orderLineCount,
  };
}

async function getOrderLineCountsBySku(): Promise<Map<string, number>> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("order_line_items")
    .select("sku, title");

  if (error) {
    throw new Error(error.message);
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const sku = resolveLineItemSkuForDisplay(row.sku, row.title);
    if (!sku) {
      continue;
    }
    counts.set(sku, (counts.get(sku) ?? 0) + 1);
  }
  return counts;
}

export async function getProductsFromSupabase(): Promise<Product[]> {
  const supabase = createSupabaseAdmin();

  const [{ data: rows, error }, lineCounts] = await Promise.all([
    supabase.from("products").select("*").order("title"),
    getOrderLineCountsBySku(),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  return (rows ?? []).map((row) =>
    rowToProduct(row, lineCounts.get(row.sku) ?? 0),
  );
}

export async function getProductCatalogFromSupabase(): Promise<
  { sku: string; unitCost: number | null }[]
> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("products")
    .select("sku, unit_cost");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    sku: row.sku,
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
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

  const lineCounts = await getOrderLineCountsBySku();
  return rowToProduct(data, lineCounts.get(sku) ?? 0);
}

export async function syncProductsFromOrdersInSupabase(): Promise<{
  imported: number;
  total: number;
}> {
  const supabase = createSupabaseAdmin();

  const { data: lineItems, error: itemsError } = await supabase
    .from("order_line_items")
    .select("sku, title, image_url, shopify_order_id")
    .order("shopify_order_id", { ascending: false });

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const bySku = new Map<
    string,
    { title: string; imageUrl: string | null }
  >();

  for (const item of lineItems ?? []) {
    const sku = resolveLineItemSkuForDisplay(item.sku, item.title);
    if (!sku || bySku.has(sku)) {
      continue;
    }
    bySku.set(sku, {
      title: item.title,
      imageUrl: item.image_url,
    });
  }

  if (!bySku.size) {
    const total = await getProductsFromSupabase();
    return { imported: 0, total: total.length };
  }

  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("sku");

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingSkus = new Set((existing ?? []).map((r) => r.sku));
  const toInsert: ProductInsert[] = [];

  for (const [sku, meta] of bySku) {
    if (existingSkus.has(sku)) {
      continue;
    }
    toInsert.push({
      sku,
      title: meta.title,
      image_url: meta.imageUrl,
    });
  }

  if (toInsert.length) {
    const { error: insertError } = await supabase
      .from("products")
      .insert(toInsert);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const total = await getProductsFromSupabase();
  return { imported: toInsert.length, total: total.length };
}
