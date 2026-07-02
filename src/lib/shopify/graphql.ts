import { shopifyAdminFetch } from "@/lib/shopify/client";
import { getShopifyConfig } from "@/lib/shopify/config";
import { getShopifyAccessToken } from "@/lib/shopify/auth";

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

export async function shopifyAdminGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const { storeDomain, apiVersion, isConfigured } = getShopifyConfig();

  if (!isConfigured || !storeDomain) {
    throw new Error("Shopify is not configured.");
  }

  const host = storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const accessToken = await getShopifyAccessToken();
  const response = await fetch(
    `https://${host}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Shopify GraphQL error (${response.status}): ${text.slice(0, 300)}`);
  }

  const parsed = JSON.parse(text) as GraphqlResponse<T>;
  if (parsed.errors?.length) {
    throw new Error(parsed.errors.map((e) => e.message).join("; "));
  }

  if (!parsed.data) {
    throw new Error("Shopify GraphQL returned no data.");
  }

  return parsed.data;
}

export function parseShopifyGid(gid: string): number {
  const id = gid.split("/").pop();
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid Shopify GID: ${gid}`);
  }
  return numeric;
}

type InventoryLevelPayload = {
  inventory_item_id: number;
  location_id: number;
  available: number | null;
  updated_at?: string;
};

type InventoryLevelsResponse = {
  inventory_levels: InventoryLevelPayload[];
};

export async function setShopifyInventoryAvailable(
  inventoryItemId: number,
  locationId: number,
  available: number,
): Promise<InventoryLevelPayload> {
  const data = await shopifyAdminFetch<{ inventory_level: InventoryLevelPayload }>(
    "/inventory_levels/set.json",
    {
      method: "POST",
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available,
      }),
    },
  );

  return data.inventory_level;
}

export async function getShopifyInventoryLevels(
  inventoryItemId: number,
): Promise<InventoryLevelPayload[]> {
  const data = await shopifyAdminFetch<InventoryLevelsResponse>(
    `/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
  );
  return data.inventory_levels ?? [];
}
