import fs from "fs/promises";
import path from "path";

import {
  getProductCatalogFromSupabase,
  getProductsFromSupabase,
  syncProductsFromShopifyInSupabase,
  updateProductCostInSupabase,
} from "@/lib/products/supabase-store";
import { fetchAllShopifyCatalogVariants } from "@/lib/shopify/products-catalog";
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
  return products.map((p) => ({
    sku: p.sku,
    unitCost: p.unitCost,
    temuSku: p.temuSku,
  }));
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

export async function syncProductsFromShopify(): Promise<{
  imported: number;
  updated: number;
  removed: number;
  total: number;
}> {
  if (isSupabaseConfigured()) {
    return syncProductsFromShopifyInSupabase();
  }

  const shopifyVariants = await fetchAllShopifyCatalogVariants();
  const shopifySkus = new Set(shopifyVariants.map((variant) => variant.sku));
  const products = await readProductsFromJson();
  const existingBySku = new Map(products.map((product) => [product.sku, product]));
  const now = new Date().toISOString();

  let imported = 0;
  let updated = 0;
  const nextProducts: Product[] = [];

  for (const variant of shopifyVariants) {
    const previous = existingBySku.get(variant.sku);
    if (!previous) {
      imported += 1;
    } else {
      updated += 1;
    }

    nextProducts.push({
      sku: variant.sku,
      title: variant.title,
      unitCost: previous?.unitCost ?? null,
      defaultPostage: previous?.defaultPostage ?? null,
      imageUrl: variant.imageUrl,
      shopifyProductId: variant.shopifyProductId,
      temuSku: previous?.temuSku ?? null,
      updatedAt: now,
      orderLineCount: previous?.orderLineCount ?? 0,
    });
  }

  const removed = products.filter((product) => !shopifySkus.has(product.sku)).length;
  await writeProductsToJson(nextProducts);

  return {
    imported,
    updated,
    removed,
    total: nextProducts.length,
  };
}
