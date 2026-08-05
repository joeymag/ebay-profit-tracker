import {
  getShopifyInventoryLevels,
  parseShopifyGid,
  setShopifyInventoryAvailable,
  shopifyAdminGraphql,
} from "@/lib/shopify/graphql";
import { ShopifyApiError, shopifyAdminFetch, shopifyAdminFetchWithLink } from "@/lib/shopify/client";
import {
  getShopifyProductAdminUrl,
  getShopifyStorefrontProductUrl,
} from "@/lib/shopify/config";
import {
  attachSalesInsight,
  getUnitsSoldForSku,
  getUnitsSoldMap,
  parsePackSizeFromOptions,
  type SkuSalesStats,
  type StockSalesInsight,
} from "@/lib/orders/sku-units-sold";

export type { StockSalesInsight };

export type StockLocationLevel = {
  locationId: number;
  locationName: string;
  available: number;
};

export type StockSkuLookup = {
  sku: string;
  variantId: number;
  productId: number;
  productHandle: string;
  inventoryItemId: number;
  productTitle: string;
  variantTitle: string;
  displayName: string;
  imageUrl: string | null;
  adminUrl: string | null;
  storefrontUrl: string | null;
  tracked: boolean;
  locations: StockLocationLevel[];
} & StockSalesInsight;

export type OutOfStockItem = {
  sku: string;
  productTitle: string;
  variantTitle: string;
  displayName: string;
  imageUrl: string | null;
  available: number;
} & StockSalesInsight;

export type InventoryMapItem = {
  variantId: number;
  productId: number;
  sku: string | null;
  barcode: string | null;
  productTitle: string;
  variantTitle: string;
  displayName: string;
  imageUrl: string | null;
  available: number;
  tracked: boolean;
} & StockSalesInsight;

export type InventoryMapSummary = {
  totalTracked: number;
  withSku: number;
  withoutSku: number;
  inStock: number;
  outOfStock: number;
  lowStock: number;
};

type ShopifyProductRest = {
  id: number;
  title: string;
  image?: { src: string } | null;
  variants: {
    id: number;
    title: string;
    sku: string | null;
    barcode: string | null;
    inventory_management: string | null;
    inventory_quantity: number;
    option1: string | null;
    option2: string | null;
    option3: string | null;
  }[];
};

function salesStatsForVariant(
  sku: string,
  salesMap: Map<string, SkuSalesStats>,
  variant: ShopifyProductRest["variants"][number],
) {
  const sales = salesMap.get(sku.trim().toUpperCase()) ?? {
    unitsSold: 0,
    orderCount: 0,
    unitsSold30Days: 0,
    unitsSold90Days: 0,
    orderCount30Days: 0,
  };
  const packSize = parsePackSizeFromOptions(
    [variant.option1, variant.option2, variant.option3]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value, index) => ({
        name: `option${index + 1}`,
        value: value.trim(),
      })),
  );

  return attachSalesInsight(variant.inventory_quantity, sales, packSize);
}

function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const part of linkHeader.split(",")) {
    const section = part.trim();
    if (section.endsWith('rel="next"')) {
      const match = section.match(/page_info=([^&>]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  return null;
}

type ShopifyVariantRest = ShopifyProductRest["variants"][number];

/** Shopify embeds at most 100 variants on the product list resource. */
const EMBEDDED_VARIANT_LIMIT = 100;
const VARIANTS_PAGE_LIMIT = 250;

async function fetchAllVariantsForProduct(
  productId: number,
): Promise<ShopifyVariantRest[]> {
  const variants: ShopifyVariantRest[] = [];
  let pageInfo: string | null = null;
  const fields =
    "id,title,sku,barcode,inventory_management,inventory_quantity,option1,option2,option3";

  for (let page = 0; page < 20; page += 1) {
    const path = pageInfo
      ? `/products/${productId}/variants.json?limit=${VARIANTS_PAGE_LIMIT}&fields=${fields}&page_info=${pageInfo}`
      : `/products/${productId}/variants.json?limit=${VARIANTS_PAGE_LIMIT}&fields=${fields}`;

    const { data, linkHeader } = await shopifyAdminFetchWithLink<{
      variants: ShopifyVariantRest[];
    }>(path);

    variants.push(...(data.variants ?? []));
    pageInfo = parseNextPageInfo(linkHeader);
    if (!pageInfo) {
      break;
    }
  }

  return variants;
}

async function resolveProductVariants(
  product: ShopifyProductRest,
): Promise<ShopifyVariantRest[]> {
  const embedded = product.variants ?? [];
  if (embedded.length < EMBEDDED_VARIANT_LIMIT) {
    return embedded;
  }

  return fetchAllVariantsForProduct(product.id);
}

/** Tracked Shopify variants with zero available inventory. */
export async function listOutOfStockItems(options?: {
  maxPages?: number;
}): Promise<OutOfStockItem[]> {
  const maxPages = options?.maxPages ?? 40;
  const items: OutOfStockItem[] = [];
  const salesMap = await getUnitsSoldMap();
  let pageInfo: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const path = pageInfo
      ? `/products.json?limit=250&fields=id,title,image,variants&page_info=${pageInfo}`
      : "/products.json?limit=250&fields=id,title,image,variants";

    const { data, linkHeader } = await shopifyAdminFetchWithLink<{
      products: ShopifyProductRest[];
    }>(path);

    const products = data.products ?? [];
    const variantLists = await Promise.all(
      products.map((product) => resolveProductVariants(product)),
    );

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index]!;
      const variants = variantLists[index] ?? [];

      for (const variant of variants) {
        const sku = variant.sku?.trim();
        if (!sku) {
          continue;
        }
        if (variant.inventory_management !== "shopify") {
          continue;
        }
        if (variant.inventory_quantity > 0) {
          continue;
        }

        items.push({
          sku,
          productTitle: product.title,
          variantTitle: variant.title,
          displayName:
            variant.title === "Default Title"
              ? product.title
              : `${product.title} — ${variant.title}`,
          imageUrl: product.image?.src ?? null,
          available: variant.inventory_quantity,
          ...salesStatsForVariant(sku, salesMap, variant),
        });
      }
    }

    pageInfo = parseNextPageInfo(linkHeader);
    if (!pageInfo) {
      break;
    }
  }

  return items.sort(
    (a, b) =>
      b.unitsSold30Days - a.unitsSold30Days ||
      b.unitsSold - a.unitsSold ||
      a.displayName.localeCompare(b.displayName),
  );
}

function variantDisplayName(
  productTitle: string,
  variantTitle: string,
): string {
  return variantTitle === "Default Title"
    ? productTitle
    : `${productTitle} — ${variantTitle}`;
}

function insightForVariant(
  sku: string | null,
  salesMap: Map<string, SkuSalesStats>,
  variant: ShopifyProductRest["variants"][number],
) {
  if (!sku) {
    return attachSalesInsight(variant.inventory_quantity, EMPTY_SALES, 1);
  }

  return salesStatsForVariant(sku, salesMap, variant);
}

const EMPTY_SALES: SkuSalesStats = {
  unitsSold: 0,
  orderCount: 0,
  unitsSold30Days: 0,
  unitsSold90Days: 0,
  orderCount30Days: 0,
};

/** All tracked Shopify variants with stock levels and sales insight. */
export async function listInventoryMapItems(options?: {
  maxPages?: number;
}): Promise<{ items: InventoryMapItem[]; summary: InventoryMapSummary }> {
  const maxPages = options?.maxPages ?? 40;
  const items: InventoryMapItem[] = [];
  const salesMap = await getUnitsSoldMap();
  let pageInfo: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const path = pageInfo
      ? `/products.json?limit=250&fields=id,title,image,variants&page_info=${pageInfo}`
      : "/products.json?limit=250&fields=id,title,image,variants";

    const { data, linkHeader } = await shopifyAdminFetchWithLink<{
      products: ShopifyProductRest[];
    }>(path);

    const products = data.products ?? [];
    const variantLists = await Promise.all(
      products.map((product) => resolveProductVariants(product)),
    );

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index]!;
      const variants = variantLists[index] ?? [];

      for (const variant of variants) {
        if (variant.inventory_management !== "shopify") {
          continue;
        }

        const sku = variant.sku?.trim() || null;
        const barcode = variant.barcode?.trim() || null;
        items.push({
          variantId: variant.id,
          productId: product.id,
          sku,
          barcode,
          productTitle: product.title,
          variantTitle: variant.title,
          displayName: variantDisplayName(product.title, variant.title),
          imageUrl: product.image?.src ?? null,
          available: variant.inventory_quantity,
          tracked: true,
          ...insightForVariant(sku, salesMap, variant),
        });
      }
    }

    pageInfo = parseNextPageInfo(linkHeader);
    if (!pageInfo) {
      break;
    }
  }

  items.sort(
    (a, b) =>
      a.available - b.available ||
      b.unitsSold30Days - a.unitsSold30Days ||
      a.displayName.localeCompare(b.displayName),
  );

  const summary: InventoryMapSummary = {
    totalTracked: items.length,
    withSku: items.filter((item) => item.sku).length,
    withoutSku: items.filter((item) => !item.sku).length,
    inStock: items.filter((item) => item.available > 0).length,
    outOfStock: items.filter((item) => item.available <= 0).length,
    lowStock: items.filter((item) => item.available > 0 && item.available <= 5)
      .length,
  };

  return { items, summary };
}

const VARIANT_BY_SKU_QUERY = `
  query VariantBySku($query: String!) {
    productVariants(first: 25, query: $query) {
      edges {
        node {
          id
          sku
          title
          displayName
          selectedOptions {
            name
            value
          }
          product {
            id
            title
            handle
            featuredImage {
              url
            }
          }
          inventoryItem {
            id
            tracked
          }
        }
      }
    }
  }
`;

type VariantBySkuResponse = {
  productVariants: {
    edges: {
      node: {
        id: string;
        sku: string | null;
        title: string;
        displayName: string;
        selectedOptions: { name: string; value: string }[];
        product: {
          id: string;
          title: string;
          handle: string;
          featuredImage: { url: string } | null;
        };
        inventoryItem: {
          id: string;
          tracked: boolean;
        };
      };
    }[];
  };
};

function escapeSkuQuery(sku: string): string {
  return sku.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

type VariantBySkuNode = VariantBySkuResponse["productVariants"]["edges"][number]["node"];

async function buildStockSkuLookup(match: VariantBySkuNode): Promise<StockSkuLookup | null> {
  if (!match.sku?.trim()) {
    return null;
  }

  const inventoryItemId = parseShopifyGid(match.inventoryItem.id);
  const levels = await getShopifyInventoryLevels(inventoryItemId);
  const locations: StockLocationLevel[] = levels.map((level) => ({
    locationId: level.location_id,
    locationName: `Location ${level.location_id}`,
    available: level.available ?? 0,
  }));

  const sales = await getUnitsSoldForSku(match.sku);
  const packSize = parsePackSizeFromOptions(match.selectedOptions ?? []);
  const available = locations.reduce((sum, level) => sum + level.available, 0);
  const productId = parseShopifyGid(match.product.id);
  const productHandle = match.product.handle;

  return {
    sku: match.sku,
    variantId: parseShopifyGid(match.id),
    productId,
    productHandle,
    inventoryItemId,
    productTitle: match.product.title,
    variantTitle: match.title,
    displayName: match.displayName,
    imageUrl: match.product.featuredImage?.url ?? null,
    adminUrl: getShopifyProductAdminUrl(productId),
    storefrontUrl: getShopifyStorefrontProductUrl(productHandle),
    tracked: match.inventoryItem.tracked,
    locations,
    ...attachSalesInsight(available, sales, packSize),
  };
}

/** All Shopify variants that share a SKU (duplicate listings). */
export async function lookupAllStockBySku(rawSku: string): Promise<StockSkuLookup[]> {
  const sku = rawSku.trim();
  if (!sku) {
    return [];
  }

  const data = await shopifyAdminGraphql<VariantBySkuResponse>(VARIANT_BY_SKU_QUERY, {
    query: `sku:${escapeSkuQuery(sku)}`,
  });

  const matches = data.productVariants.edges
    .map((edge) => edge.node)
    .filter((node) => node.sku?.trim().toLowerCase() === sku.toLowerCase());

  const lookups: StockSkuLookup[] = [];
  for (const match of matches) {
    const lookup = await buildStockSkuLookup(match);
    if (lookup) {
      lookups.push(lookup);
    }
  }

  return lookups;
}

export async function lookupStockBySku(rawSku: string): Promise<StockSkuLookup | null> {
  const lookups = await lookupAllStockBySku(rawSku);
  return lookups[0] ?? null;
}

function resolveLocationId(
  lookup: StockSkuLookup,
  locationId?: number,
): number {
  if (locationId != null) {
    return locationId;
  }

  const configured = process.env.SHOPIFY_LOCATION_ID?.trim();
  if (configured) {
    return Number.parseInt(configured, 10);
  }

  const first = lookup.locations[0]?.locationId;
  if (first != null) {
    return first;
  }

  throw new Error(
    "No inventory location found for this SKU. Add SHOPIFY_LOCATION_ID in env or assign stock to a location in Shopify first.",
  );
}

export async function updateStockQuantity(input: {
  sku: string;
  available: number;
  locationId?: number;
}): Promise<{
  lookup: StockSkuLookup;
  locationId: number;
  available: number;
  updatedVariantCount: number;
}> {
  if (!Number.isFinite(input.available) || input.available < 0) {
    throw new Error("Quantity must be zero or greater.");
  }

  const lookups = await lookupAllStockBySku(input.sku);
  if (lookups.length === 0) {
    throw new Error(`No Shopify product found for SKU "${input.sku.trim()}".`);
  }

  const tracked = lookups.filter((lookup) => lookup.tracked);
  if (tracked.length === 0) {
    throw new Error(
      "Inventory is not tracked for this variant in Shopify. Enable inventory tracking on the product first.",
    );
  }

  const quantity = Math.floor(input.available);
  let primaryLookup = tracked[0]!;
  let primaryLocationId = resolveLocationId(primaryLookup, input.locationId);

  try {
    for (const lookup of tracked) {
      const locationId = resolveLocationId(lookup, input.locationId);
      await setShopifyInventoryAvailable(
        lookup.inventoryItemId,
        locationId,
        quantity,
      );
      primaryLookup = lookup;
      primaryLocationId = locationId;
    }
  } catch (error) {
    if (error instanceof ShopifyApiError && error.status === 403) {
      throw new Error(
        "Shopify rejected the update. Add Admin API scope write_inventory to your Partners app, release a new version, and reinstall on your store.",
      );
    }
    throw error;
  }

  const refreshed = await lookupStockBySku(input.sku);
  if (!refreshed) {
    throw new Error("Stock updated but could not reload product details.");
  }

  return {
    lookup: refreshed,
    locationId: primaryLocationId,
    available: quantity,
    updatedVariantCount: tracked.length,
  };
}

export function isShopifyInventoryError(error: unknown): error is Error {
  return error instanceof Error;
}

export async function setVariantIdentifiers(
  variantId: number,
  input: { sku?: string; barcode?: string | null },
): Promise<{ sku: string | null; barcode: string | null }> {
  const trimmedSku = input.sku?.trim();
  let trimmedBarcode: string | null | undefined;

  if (input.barcode !== undefined) {
    trimmedBarcode = input.barcode?.trim() || null;
  } else if (trimmedSku) {
    trimmedBarcode = trimmedSku;
  }

  if (!trimmedSku && trimmedBarcode === undefined) {
    throw new Error("SKU or barcode is required.");
  }

  const payload: { id: number; sku?: string; barcode?: string | null } = {
    id: variantId,
  };
  if (trimmedSku) {
    payload.sku = trimmedSku;
  }
  if (trimmedBarcode !== undefined) {
    payload.barcode = trimmedBarcode;
  }

  try {
    const data = await shopifyAdminFetch<{
      variant: { id: number; sku: string | null; barcode: string | null };
    }>(`/variants/${variantId}.json`, {
      method: "PUT",
      body: JSON.stringify({ variant: payload }),
    });

    return {
      sku: data.variant?.sku?.trim() || null,
      barcode: data.variant?.barcode?.trim() || null,
    };
  } catch (error) {
    if (error instanceof ShopifyApiError && error.status === 403) {
      throw new Error(
        "Shopify rejected the variant update. Add Admin API scope write_products to your app, release a new version, and reinstall on your store.",
      );
    }
    throw error;
  }
}

export async function setVariantSku(
  variantId: number,
  sku: string,
): Promise<string> {
  const trimmed = sku.trim();
  if (!trimmed) {
    throw new Error("SKU is required.");
  }

  const result = await setVariantIdentifiers(variantId, {
    sku: trimmed,
    barcode: trimmed,
  });
  const assigned = result.sku;
  if (!assigned) {
    throw new Error("Shopify did not return the updated SKU.");
  }

  return assigned;
}
