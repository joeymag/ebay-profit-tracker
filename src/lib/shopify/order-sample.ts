import { getStoredOrders } from "@/lib/orders/store";
import { shopifyAdminFetch } from "@/lib/shopify/client";
import type { ShopifyOrder, ShopifyOrdersResponse } from "@/lib/shopify/types";

function summarizeKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.keys(obj).map((key) => {
    const value = obj[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      return `${path} (null)`;
    }
    if (Array.isArray(value)) {
      const sample = value[0];
      if (sample && typeof sample === "object") {
        return `${path}[] — keys: ${Object.keys(sample as object).join(", ")}`;
      }
      return `${path}[] (${value.length} items)`;
    }
    if (typeof value === "object") {
      return `${path} {} — keys: ${Object.keys(value as object).join(", ")}`;
    }
    return `${path} (${typeof value})`;
  });
}

export async function getShopifyOrderSample() {
  const { orders } = await shopifyAdminFetch<ShopifyOrdersResponse>(
    "/orders.json?status=any&limit=1",
  );

  const raw = orders[0];
  if (!raw) {
    return null;
  }

  const storedDb = await getStoredOrders();
  const storedMatch = storedDb.orders.find((o) => o.shopifyId === raw.id);
  const rawRecord = raw as unknown as Record<string, unknown>;

  return {
    description:
      "Raw Shopify REST order object (first order). Compare fieldSummary vs currentlyStored.",
    endpoint: "GET /admin/api/{version}/orders.json?limit=1",
    fieldSummary: summarizeKeys(rawRecord),
    lineItemFieldSummary: raw.line_items[0]
      ? summarizeKeys(
          raw.line_items[0] as unknown as Record<string, unknown>,
          "line_items[]",
        )
      : [],
    currentlyStored: storedMatch ?? null,
    currentlyStoredNote:
      "Fields we save today. Everything under raw is available from Shopify.",
    raw: raw as ShopifyOrder,
  };
}
