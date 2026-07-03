import {
  getShopifyInventoryLevels,
  parseShopifyGid,
  setShopifyInventoryAvailable,
  shopifyAdminGraphql,
} from "@/lib/shopify/graphql";
import { ShopifyApiError, shopifyAdminFetchWithLink } from "@/lib/shopify/client";

export type StockLocationLevel = {
  locationId: number;
  locationName: string;
  available: number;
};

export type StockSkuLookup = {
  sku: string;
  variantId: number;
  inventoryItemId: number;
  productTitle: string;
  variantTitle: string;
  displayName: string;
  imageUrl: string | null;
  tracked: boolean;
  locations: StockLocationLevel[];
};

export type OutOfStockItem = {
  sku: string;
  productTitle: string;
  variantTitle: string;
  displayName: string;
  imageUrl: string | null;
  available: number;
};

type ShopifyProductRest = {
  id: number;
  title: string;
  image?: { src: string } | null;
  variants: {
    title: string;
    sku: string | null;
    inventory_management: string | null;
    inventory_quantity: number;
  }[];
};

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

/** Tracked Shopify variants with zero available inventory. */
export async function listOutOfStockItems(options?: {
  maxPages?: number;
}): Promise<OutOfStockItem[]> {
  const maxPages = options?.maxPages ?? 40;
  const items: OutOfStockItem[] = [];
  let pageInfo: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const path = pageInfo
      ? `/products.json?limit=250&fields=id,title,image,variants&page_info=${pageInfo}`
      : "/products.json?limit=250&fields=id,title,image,variants";

    const { data, linkHeader } = await shopifyAdminFetchWithLink<{
      products: ShopifyProductRest[];
    }>(path);

    for (const product of data.products ?? []) {
      for (const variant of product.variants ?? []) {
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
        });
      }
    }

    pageInfo = parseNextPageInfo(linkHeader);
    if (!pageInfo) {
      break;
    }
  }

  return items.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

const VARIANT_BY_SKU_QUERY = `
  query VariantBySku($query: String!) {
    productVariants(first: 5, query: $query) {
      edges {
        node {
          id
          sku
          title
          displayName
          product {
            title
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
        product: {
          title: string;
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

export async function lookupStockBySku(rawSku: string): Promise<StockSkuLookup | null> {
  const sku = rawSku.trim();
  if (!sku) {
    return null;
  }

  const data = await shopifyAdminGraphql<VariantBySkuResponse>(VARIANT_BY_SKU_QUERY, {
    query: `sku:${escapeSkuQuery(sku)}`,
  });

  const match = data.productVariants.edges.find(
    (edge) => edge.node.sku?.trim().toLowerCase() === sku.toLowerCase(),
  )?.node ?? data.productVariants.edges[0]?.node;

  if (!match?.sku) {
    return null;
  }

  const inventoryItemId = parseShopifyGid(match.inventoryItem.id);
  const levels = await getShopifyInventoryLevels(inventoryItemId);
  const locations: StockLocationLevel[] = levels.map((level) => ({
    locationId: level.location_id,
    locationName: `Location ${level.location_id}`,
    available: level.available ?? 0,
  }));

  return {
    sku: match.sku,
    variantId: parseShopifyGid(match.id),
    inventoryItemId,
    productTitle: match.product.title,
    variantTitle: match.title,
    displayName: match.displayName,
    imageUrl: match.product.featuredImage?.url ?? null,
    tracked: match.inventoryItem.tracked,
    locations,
  };
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
}> {
  if (!Number.isFinite(input.available) || input.available < 0) {
    throw new Error("Quantity must be zero or greater.");
  }

  const lookup = await lookupStockBySku(input.sku);
  if (!lookup) {
    throw new Error(`No Shopify product found for SKU "${input.sku.trim()}".`);
  }

  if (!lookup.tracked) {
    throw new Error(
      "Inventory is not tracked for this variant in Shopify. Enable inventory tracking on the product first.",
    );
  }

  const locationId = resolveLocationId(lookup, input.locationId);

  try {
    await setShopifyInventoryAvailable(
      lookup.inventoryItemId,
      locationId,
      Math.floor(input.available),
    );
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
    locationId,
    available: Math.floor(input.available),
  };
}

export function isShopifyInventoryError(error: unknown): error is Error {
  return error instanceof Error;
}
