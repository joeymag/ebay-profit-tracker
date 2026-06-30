import {
  shopifyAdminFetchWithLink,
} from "@/lib/shopify/client";
import { firstUsableBuyerName } from "@/lib/shopify/buyer-name";
import { parseAmazonOrderIdFromNoteAttributes, parseAmazonDeliverByAtFromNoteAttributes } from "@/lib/shopify/amazon-order-id";
import {
  parseEbayDeliverByAtFromNoteAttributes,
  parseEbayOrderIdFromNoteAttributes,
} from "@/lib/shopify/ebay-note-attributes";
import { parseOrderShipping } from "@/lib/shopify/shipping";
import { parseEbayUsernameForOrder } from "@/lib/orders/ebay-buyer";
import { parseShippingAddress } from "@/lib/orders/shipping-address";
import type { StoredLineItem, StoredOrder } from "@/lib/orders/types";
import type { ShopifyOrder, ShopifyOrdersResponse } from "@/lib/shopify/types";

const PAGE_SIZE = 250;
const MAX_PAGES = 40;

function parseAmount(value: string | undefined): number {
  const n = Number.parseFloat(value ?? "0");
  return Number.isFinite(n) ? n : 0;
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

function nameFromAddress(
  address: { first_name?: string | null; last_name?: string | null; name?: string | null } | null | undefined,
): string | null {
  if (!address) {
    return null;
  }
  if (address.name?.trim()) {
    return address.name.trim();
  }
  const parts = [address.first_name, address.last_name]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function buyerNameFromNoteAttributes(
  order: Pick<ShopifyOrder, "note_attributes">,
): string | null {
  for (const attribute of order.note_attributes ?? []) {
    const key = attribute.name?.trim().toLowerCase() ?? "";
    const value = attribute.value?.trim();
    if (!value) {
      continue;
    }

    if (
      key.includes("ebay") &&
      (key.includes("user") || key.includes("buyer"))
    ) {
      if (value.includes("(")) {
        return value;
      }

      return `${value} (${value})`;
    }
  }

  return null;
}

function parseBuyerName(order: ShopifyOrder): string | null {
  return firstUsableBuyerName(
    nameFromAddress(order.shipping_address),
    nameFromAddress(order.billing_address),
    buyerNameFromNoteAttributes(order),
    nameFromAddress(order.customer),
    order.customer?.display_name,
  );
}

import { resolveLineItemSkuForDisplay } from "@/lib/orders/line-item-sku";

function normalizeOrder(order: ShopifyOrder): StoredOrder {
  const revenue = parseAmount(order.total_price);
  const lineItems: StoredLineItem[] = order.line_items.map((item) => ({
    id: item.id,
    title: item.title,
    quantity: item.quantity,
    sku: resolveLineItemSkuForDisplay(item.sku, item.title),
    price: parseAmount(item.price),
    productId: item.product_id ?? null,
    variantId: item.variant_id ?? null,
    imageUrl: null,
    unitCost: null,
  }));
  const itemCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);
  const {
    shippingCarrier,
    shippingService,
    trackingNumbers,
    trackingUrl,
    shipmentStatus,
    deliveredAt,
  } = parseOrderShipping(order);

  return {
    shopifyId: order.id,
    orderNumber: order.name,
    createdAt: order.created_at,
    cancelledAt: order.cancelled_at ?? null,
    financialStatus: order.cancelled_at
      ? "cancelled"
      : order.financial_status,
    fulfillmentStatus: order.fulfillment_status ?? null,
    tags: order.tags?.trim() || null,
    buyerName: parseBuyerName(order),
    ebayUsername: parseEbayUsernameForOrder({
      buyerName: parseBuyerName(order),
      tags: order.tags?.trim() || null,
    }),
    ebayOrderId: parseEbayOrderIdFromNoteAttributes(order.note_attributes),
    amazonOrderId: parseAmazonOrderIdFromNoteAttributes(order.note_attributes),
    amazonDeliverByAt: parseAmazonDeliverByAtFromNoteAttributes(order.note_attributes),
    ebayDeliverByAt: parseEbayDeliverByAtFromNoteAttributes(order.note_attributes),
    ebayFeesActual: null,
    ebayFeesSyncedAt: null,
    ebayFeeRate: null,
    ebayAdsFeeRate: null,
    shippingAddress: parseShippingAddress(order),
    latitude: null,
    longitude: null,
    geocodeRegion: null,
    geocodedAt: null,
    currency: order.currency,
    revenue,
    subtotal: parseAmount(order.subtotal_price),
    tax: parseAmount(order.total_tax),
    shippingCharged: parseAmount(
      order.total_shipping_price_set?.shop_money.amount,
    ),
    shippingLabelCost: null,
    productCost: null,
    productCostManual: false,
    shippingCarrier,
    shippingService,
    trackingNumbers,
    trackingUrl,
    shipmentStatus,
    deliveredAt,
    itemCount,
    cost: null,
    profit: null,
    platformFee: null,
    lineItems,
  };
}

export async function fetchAllShopifyOrders(): Promise<StoredOrder[]> {
  const byId = new Map<number, StoredOrder>();
  let pageInfo: string | null = null;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (pageInfo) {
      params.set("page_info", pageInfo);
    } else {
      params.set("status", "any");
    }

    const { data, linkHeader } = await shopifyAdminFetchWithLink<ShopifyOrdersResponse>(
      `/orders.json?${params.toString()}`,
    );

    if (!data.orders.length) {
      break;
    }

    for (const order of data.orders) {
      const normalized = normalizeOrder(order);
      byId.set(normalized.shopifyId, normalized);
    }

    pageInfo = parseNextPageInfo(linkHeader);
    pages += 1;

    if (!pageInfo) {
      break;
    }
  }

  return [...byId.values()].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
