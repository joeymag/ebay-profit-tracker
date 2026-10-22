import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchTemuGoodsSkus } from "@/lib/temu/goods-list";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

export type LinkTemuProductsResult = {
  ok: true;
  linkedFromOrders: number;
  linkedFromTemuApi: number;
  temuGoodsSkus: number;
  alreadyLinked: number;
  skipped: boolean;
  skipReason?: string;
};

type OrderPair = {
  sku: string;
  temu_sku: string;
  hits: number;
};

/**
 * Link Shopify catalog products to Temu SKU ids so Temu order costs resolve
 * the same way eBay/Amazon do (via the products list).
 */
export async function linkTemuProductsToCatalog(): Promise<LinkTemuProductsResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: true,
      linkedFromOrders: 0,
      linkedFromTemuApi: 0,
      temuGoodsSkus: 0,
      alreadyLinked: 0,
      skipped: true,
      skipReason: "Supabase is not configured.",
    };
  }

  const supabase = createSupabaseAdmin();

  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("sku, temu_sku");
  if (productsError) {
    throw new Error(productsError.message);
  }

  const productsBySku = new Map(
    (productRows ?? []).map((row) => [row.sku.trim(), row]),
  );
  const productsBySkuLower = new Map(
    (productRows ?? []).map((row) => [row.sku.trim().toLowerCase(), row.sku.trim()]),
  );

  let alreadyLinked = (productRows ?? []).filter((row) => row.temu_sku?.trim()).length;
  let linkedFromOrders = 0;
  let linkedFromTemuApi = 0;

  // 1) From Temu order history: most common Temu SKU per Shopify SKU.
  const { data: lineRows, error: linesError } = await supabase
    .from("order_line_items")
    .select("sku, temu_sku, shopify_order_id");
  if (linesError) {
    throw new Error(linesError.message);
  }

  const { data: temuOrders, error: ordersError } = await supabase
    .from("orders")
    .select("shopify_id")
    .ilike("tags", "%temu%");
  if (ordersError) {
    throw new Error(ordersError.message);
  }
  const temuOrderIds = new Set((temuOrders ?? []).map((row) => row.shopify_id));

  const pairHits = new Map<string, OrderPair>();
  for (const line of lineRows ?? []) {
    if (!temuOrderIds.has(line.shopify_order_id)) continue;
    const sku = line.sku?.trim() ?? "";
    const temuSku = line.temu_sku?.trim() ?? "";
    if (!sku || !temuSku || sku === temuSku) continue;
    if (!productsBySku.has(sku)) continue;
    const key = `${sku}::${temuSku}`;
    const existing = pairHits.get(key);
    if (existing) {
      existing.hits += 1;
    } else {
      pairHits.set(key, { sku, temu_sku: temuSku, hits: 1 });
    }
  }

  const bestBySku = new Map<string, OrderPair>();
  for (const pair of pairHits.values()) {
    const current = bestBySku.get(pair.sku);
    if (!current || pair.hits > current.hits) {
      bestBySku.set(pair.sku, pair);
    }
  }

  for (const pair of bestBySku.values()) {
    const product = productsBySku.get(pair.sku);
    if (!product) continue;
    if (product.temu_sku?.trim() === pair.temu_sku) {
      continue;
    }
    if (product.temu_sku?.trim()) {
      // Keep an existing manual link unless empty.
      continue;
    }
    const { error } = await supabase
      .from("products")
      .update({ temu_sku: pair.temu_sku, updated_at: new Date().toISOString() })
      .eq("sku", pair.sku);
    if (error) throw new Error(error.message);
    product.temu_sku = pair.temu_sku;
    linkedFromOrders += 1;
    alreadyLinked += 1;
  }

  // 2) From Temu goods API: match seller outSkuSn / barcode to Shopify SKU.
  const credentials = await getStoredTemuCredentials();
  let temuGoodsSkus = 0;
  if (credentials) {
    try {
      const goodsSkus = await fetchTemuGoodsSkus(credentials);
      temuGoodsSkus = goodsSkus.length;
      for (const goods of goodsSkus) {
        const out = goods.outSkuSn?.trim();
        if (!out) continue;
        const shopifySku =
          productsBySku.get(out)?.sku ??
          productsBySkuLower.get(out.toLowerCase()) ??
          null;
        if (!shopifySku) continue;
        const product = productsBySku.get(shopifySku);
        if (!product || product.temu_sku?.trim()) continue;
        const { error } = await supabase
          .from("products")
          .update({
            temu_sku: goods.skuId,
            updated_at: new Date().toISOString(),
          })
          .eq("sku", shopifySku);
        if (error) throw new Error(error.message);
        product.temu_sku = goods.skuId;
        linkedFromTemuApi += 1;
        alreadyLinked += 1;
      }
    } catch (error) {
      // Order-based links still apply if the goods API is unavailable.
      console.error("[link-temu-products] Temu goods list failed:", error);
    }
  }

  return {
    ok: true,
    linkedFromOrders,
    linkedFromTemuApi,
    temuGoodsSkus,
    alreadyLinked,
    skipped: false,
  };
}

/**
 * Extra Temu SKU → unit cost aliases from order lines (one Shopify product can
 * appear under several Temu sku ids).
 */
export async function fetchTemuSkuUnitCostAliases(): Promise<
  Array<{ temuSku: string; unitCost: number; defaultPostage: number | null }>
> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createSupabaseAdmin();

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("sku, unit_cost, default_postage")
    .not("unit_cost", "is", null);
  if (productsError || !products?.length) return [];

  const costBySku = new Map(
    products.map((row) => [
      row.sku,
      {
        unitCost: Number(row.unit_cost),
        defaultPostage:
          row.default_postage == null ? null : Number(row.default_postage),
      },
    ]),
  );

  const { data: lines, error: linesError } = await supabase
    .from("order_line_items")
    .select("sku, temu_sku")
    .not("temu_sku", "is", null)
    .not("sku", "is", null);
  if (linesError || !lines) return [];

  const aliases = new Map<
    string,
    { temuSku: string; unitCost: number; defaultPostage: number | null }
  >();
  for (const line of lines) {
    const sku = line.sku?.trim();
    const temuSku = line.temu_sku?.trim();
    if (!sku || !temuSku || sku === temuSku) continue;
    const costs = costBySku.get(sku);
    if (!costs) continue;
    if (!aliases.has(temuSku)) {
      aliases.set(temuSku, {
        temuSku,
        unitCost: costs.unitCost,
        defaultPostage: costs.defaultPostage,
      });
    }
  }
  return [...aliases.values()];
}
