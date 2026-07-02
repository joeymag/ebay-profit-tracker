import {
  getShopifyInventoryLevels,
  parseShopifyGid,
  setShopifyInventoryAvailable,
  shopifyAdminGraphql,
} from "@/lib/shopify/graphql";
import { ShopifyApiError } from "@/lib/shopify/client";

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
            inventoryLevels(first: 20) {
              edges {
                node {
                  location {
                    id
                    name
                  }
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                }
              }
            }
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
          inventoryLevels: {
            edges: {
              node: {
                location: { id: string; name: string };
                quantities: { name: string; quantity: number }[];
              };
            }[];
          };
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
  let locations: StockLocationLevel[] = match.inventoryItem.inventoryLevels.edges.map(
    (edge) => ({
      locationId: parseShopifyGid(edge.node.location.id),
      locationName: edge.node.location.name,
      available:
        edge.node.quantities.find((q) => q.name === "available")?.quantity ?? 0,
    }),
  );

  if (locations.length === 0) {
    const levels = await getShopifyInventoryLevels(inventoryItemId);
    locations = levels.map((level) => ({
      locationId: level.location_id,
      locationName: `Location ${level.location_id}`,
      available: level.available ?? 0,
    }));
  }

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
