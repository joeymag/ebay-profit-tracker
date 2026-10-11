import {
  fetchRecentAmazonCancelledIds,
  fetchRecentAmazonSales,
} from "@/lib/amazon/recent-orders";
import { AmazonApiError } from "@/lib/amazon/client";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import {
  fetchRecentEbayCancelledIds,
  fetchRecentEbaySales,
} from "@/lib/ebay/recent-orders";
import { EbayApiError } from "@/lib/ebay/errors";
import { ebayOrderIdLookupVariants } from "@/lib/ebay/order-id";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";
import {
  marketplaceOrderTag,
  type MarketplaceSale,
} from "@/lib/marketplace-orders/types";
import { cancelShopifyMarketplaceOrder } from "@/lib/shopify/cancel-marketplace-order";
import { fillShopifyOrderAddress } from "@/lib/shopify/fill-order-address";
import { shopifyAdminGraphql } from "@/lib/shopify/graphql";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type MarketplaceImportResult = {
  created: number;
  skipped: number;
  ebayCreated: number;
  amazonCreated: number;
  unmatchedSkus: string[];
  addressesUpdated: number;
  cancelled: number;
  errors: string[];
};

const EMPTY: MarketplaceImportResult = {
  created: 0,
  skipped: 0,
  ebayCreated: 0,
  amazonCreated: 0,
  unmatchedSkus: [],
  addressesUpdated: 0,
  cancelled: 0,
  errors: [],
};

function splitName(name: string | null): { firstName: string; lastName: string } {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return { firstName: "Customer", lastName: "-" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "-" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function countryCode(value: string | null): string | null {
  const code = value?.trim().toUpperCase();
  if (!code) return null;
  if (code === "UK") return "GB";
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

async function alreadyInDatabase(sale: MarketplaceSale): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = createSupabaseAdmin();
  const column = sale.channel === "eBay" ? "ebay_order_id" : "amazon_order_id";
  const ids =
    sale.channel === "eBay" ? ebayOrderIdLookupVariants(sale.orderId) : [sale.orderId];

  for (const id of ids) {
    const { data, error } = await supabase
      .from("orders")
      .select("shopify_id")
      .eq(column, id)
      .limit(1);
    if (error) return false;
    if (data && data.length > 0) return true;
  }
  return false;
}

async function alreadyInShopify(sale: MarketplaceSale): Promise<boolean> {
  const data = await shopifyAdminGraphql<{
    orders: { edges: Array<{ node: { id: string } }> };
  }>(
    `#graphql
      query ExistingMarketplaceOrder($query: String!) {
        orders(first: 1, query: $query) {
          edges { node { id } }
        }
      }
    `,
    { query: `tag:"${marketplaceOrderTag(sale.channel, sale.orderId).replace(/"/g, '\\"')}"` },
  );
  return data.orders.edges.length > 0;
}

async function variantIdForSku(sku: string): Promise<string | null> {
  const escaped = sku.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const data = await shopifyAdminGraphql<{
    productVariants: { edges: Array<{ node: { id: string; sku: string | null } }> };
  }>(
    `#graphql
      query VariantIdBySku($query: String!) {
        productVariants(first: 5, query: $query) {
          edges { node { id sku } }
        }
      }
    `,
    { query: `sku:"${escaped}"` },
  );
  const match = data.productVariants.edges.find(
    (edge) => edge.node.sku?.trim().toLowerCase() === sku.toLowerCase(),
  );
  return match?.node.id ?? null;
}

function money(amount: number, currency: string) {
  return {
    shopMoney: {
      amount: amount.toFixed(2),
      currencyCode: currency.toUpperCase(),
    },
  };
}

async function createShopifyOrder(sale: MarketplaceSale): Promise<string[]> {
  const unmatched: string[] = [];
  const lineItems = [];
  for (const line of sale.lines) {
    const variantId = line.sku ? await variantIdForSku(line.sku) : null;
    if (line.sku && !variantId) unmatched.push(line.sku);
    lineItems.push({
      ...(variantId
        ? { variantId }
        : { title: line.title, sku: line.sku }),
      quantity: line.quantity,
      requiresShipping: true,
      priceSet: money(line.unitPrice, sale.currency),
    });
  }

  const goods = sale.lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const total = goods + sale.shipping;
  const address = sale.address;
  const country = countryCode(address?.countryCode ?? null);
  const { firstName, lastName } = splitName(address?.name ?? null);
  const mailing =
    address?.address1 && address.city && address.zip && country
      ? {
          firstName,
          lastName,
          address1: address.address1,
          address2: address.address2,
          city: address.city,
          province: address.province,
          zip: address.zip,
          countryCode: country,
          phone: address.phone,
        }
      : null;

  const attributeName =
    sale.channel === "eBay" ? "eBay Order Id" : "Amazon Order Id";

  const data = await shopifyAdminGraphql<{
    orderCreate: {
      userErrors: Array<{ message: string }>;
      order: { id: string } | null;
    };
  }>(
    `#graphql
      mutation CreateMarketplaceOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
        orderCreate(order: $order, options: $options) {
          userErrors { field message }
          order { id }
        }
      }
    `,
    {
      options: {
        inventoryBehaviour: "DECREMENT_IGNORING_POLICY",
        sendReceipt: false,
        sendFulfillmentReceipt: false,
      },
      order: {
        currency: sale.currency.toUpperCase(),
        processedAt: sale.createdAt,
        ...(sale.email ? { email: sale.email } : {}),
        ...(address?.phone ? { phone: address.phone } : {}),
        tags: [sale.channel, marketplaceOrderTag(sale.channel, sale.orderId)],
        note: `Imported from ${sale.channel} order ${sale.orderId}`,
        customAttributes: [{ key: attributeName, value: sale.orderId }],
        taxesIncluded: true,
        lineItems,
        ...(mailing
          ? { shippingAddress: mailing, billingAddress: mailing }
          : {}),
        shippingLines:
          sale.shipping > 0
            ? [
                {
                  title: "Postage",
                  priceSet: money(sale.shipping, sale.currency),
                },
              ]
            : [],
        transactions: [
          {
            kind: "SALE",
            status: "SUCCESS",
            gateway: sale.channel,
            amountSet: money(total, sale.currency),
          },
        ],
      },
    },
  );

  const errors = data.orderCreate.userErrors.map((error) => error.message);
  if (errors.length > 0 || !data.orderCreate.order) {
    throw new Error(errors.join("; ") || "Shopify did not create the order.");
  }
  return unmatched;
}

export async function importMarketplaceOrders(options?: {
  days?: number;
}): Promise<MarketplaceImportResult> {
  const days = Math.min(7, Math.max(1, options?.days ?? 3));
  const result: MarketplaceImportResult = {
    ...EMPTY,
    unmatchedSkus: [],
    errors: [],
  };
  const sales: MarketplaceSale[] = [];

  if (await getStoredEbayRefreshToken()) {
    try {
      sales.push(...(await fetchRecentEbaySales(days)));
    } catch (error) {
      const message =
        error instanceof EbayApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not load eBay orders.";
      result.errors.push(message);
    }
  }

  if (await getStoredAmazonRefreshToken()) {
    try {
      const amazon = await fetchRecentAmazonSales(days);
      sales.push(...amazon.sales);
      if (amazon.addressError) result.errors.push(amazon.addressError);
    } catch (error) {
      const message =
        error instanceof AmazonApiError
          ? error.status === 403
            ? "Amazon refused the order list. The app needs the Inventory and Order Tracking role, then reconnect Amazon in Settings."
            : error.message
          : error instanceof Error
            ? error.message
            : "Could not load Amazon orders.";
      result.errors.push(message);
    }
  }

  for (const sale of sales) {
    try {
      if ((await alreadyInDatabase(sale)) || (await alreadyInShopify(sale))) {
        result.skipped += 1;
        continue;
      }
      const unmatched = await createShopifyOrder(sale);
      result.created += 1;
      if (sale.channel === "eBay") result.ebayCreated += 1;
      else result.amazonCreated += 1;
      result.unmatchedSkus.push(...unmatched);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create failed.";
      if (/access denied|write_orders/i.test(message)) {
        result.errors.push(
          "Shopify needs the write_orders permission. Add that scope on the app, reinstall it on the store, then sync again.",
        );
        break;
      }
      result.errors.push(`${sale.channel} ${sale.orderId}: ${message}`);
    }
  }

  let addressFills = 0;
  for (const sale of sales) {
    if (sale.channel !== "Amazon" || addressFills >= 20) continue;
    if (!sale.address?.address1) continue;
    try {
      if (await fillShopifyOrderAddress(sale)) {
        addressFills += 1;
        result.addressesUpdated += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Address update failed.";
      result.errors.push(`Amazon ${sale.orderId}: ${message}`);
    }
  }

  const cancelDays = 14;
  if (await getStoredEbayRefreshToken()) {
    try {
      const cancelledIds = await fetchRecentEbayCancelledIds(cancelDays);
      await cancelImportedOrders("eBay", cancelledIds, result);
    } catch (error) {
      const message =
        error instanceof EbayApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not load cancelled eBay orders.";
      result.errors.push(message);
    }
  }

  if (await getStoredAmazonRefreshToken()) {
    try {
      const cancelledIds = await fetchRecentAmazonCancelledIds(cancelDays);
      await cancelImportedOrders("Amazon", cancelledIds, result);
    } catch (error) {
      const message =
        error instanceof AmazonApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not load cancelled Amazon orders.";
      result.errors.push(message);
    }
  }

  result.unmatchedSkus = [...new Set(result.unmatchedSkus)];
  return result;
}

async function cancelImportedOrders(
  channel: "eBay" | "Amazon",
  orderIds: string[],
  result: MarketplaceImportResult,
) {
  let attempted = 0;
  for (const orderId of orderIds) {
    if (attempted >= 15) break;
    attempted += 1;
    try {
      const outcome = await cancelShopifyMarketplaceOrder(channel, orderId);
      if (outcome === "cancelled") result.cancelled += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cancel failed.";
      result.errors.push(`${channel} ${orderId}: ${message}`);
    }
  }
}
