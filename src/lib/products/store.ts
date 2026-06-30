import fs from "fs/promises";
import path from "path";

import {
  getProductCatalogFromSupabase,
  getProductsFromSupabase,
  syncProductsFromOrdersInSupabase,
  updateProductCostInSupabase,
} from "@/lib/products/supabase-store";
import { resolveLineItemSkuForDisplay } from "@/lib/orders/line-item-sku";
import type { Product } from "@/lib/products/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const DATA_DIR = path.join(process.cwd(), "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");

type ProductsFile = { products: Product[] };

async function readProductsFromJson(): Promise<Product[]> {
  try {
    const raw = await fs.readFile(PRODUCTS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ProductsFile;
    return parsed.products ?? [];
  } catch {
    return [];
  }
}

async function writeProductsToJson(products: Product[]): Promise<Product[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    PRODUCTS_FILE,
    JSON.stringify({ products }, null, 2),
    "utf-8",
  );
  return products;
}

export async function getProducts(): Promise<Product[]> {
  if (isSupabaseConfigured()) {
    return getProductsFromSupabase();
  }
  return readProductsFromJson();
}

export async function getProductCatalog(): Promise<
  { sku: string; unitCost: number | null }[]
> {
  if (isSupabaseConfigured()) {
    return getProductCatalogFromSupabase();
  }
  const products = await readProductsFromJson();
  return products.map((p) => ({ sku: p.sku, unitCost: p.unitCost }));
}

export async function updateProductCost(
  sku: string,
  unitCost: number | null,
): Promise<Product> {
  if (isSupabaseConfigured()) {
    return updateProductCostInSupabase(sku, unitCost);
  }

  const products = await readProductsFromJson();
  const index = products.findIndex((p) => p.sku === sku);
  if (index === -1) {
    throw new Error("Product not found");
  }

  products[index] = {
    ...products[index],
    unitCost,
    updatedAt: new Date().toISOString(),
  };

  await writeProductsToJson(products);
  return products[index];
}

export async function syncProductsFromOrders(): Promise<{
  imported: number;
  total: number;
}> {
  if (isSupabaseConfigured()) {
    return syncProductsFromOrdersInSupabase();
  }

  const { getStoredOrders } = await import("@/lib/orders/store");
  const { orders } = await getStoredOrders();
  const products = await readProductsFromJson();
  const existing = new Set(products.map((p) => p.sku));
  const lineCounts = new Map<string, number>();

  for (const order of orders) {
    for (const item of order.lineItems) {
      const sku = resolveLineItemSkuForDisplay(item.sku, item.title);
      if (!sku) {
        continue;
      }
      lineCounts.set(sku, (lineCounts.get(sku) ?? 0) + 1);
      if (existing.has(sku)) {
        continue;
      }
      existing.add(sku);
      products.push({
        sku,
        title: item.title,
        unitCost: null,
        imageUrl: item.imageUrl,
        shopifyProductId: item.productId,
        updatedAt: new Date().toISOString(),
        orderLineCount: 0,
      });
    }
  }

  const withCounts = products.map((p) => ({
    ...p,
    orderLineCount: lineCounts.get(p.sku) ?? 0,
  }));

  const imported = withCounts.length - (await readProductsFromJson()).length;
  await writeProductsToJson(withCounts);
  return { imported, total: withCounts.length };
}
