import { getSalesChannel, type SalesChannel } from "@/lib/orders/channel";
import {
  extractEbayDisplayName,
  normalizeEbayUsername,
  resolveEbayUsername,
} from "@/lib/orders/ebay-buyer";
import { isPlaceholderBuyerName } from "@/lib/shopify/buyer-name";
import type { StoredOrder } from "@/lib/orders/types";

export type CustomerOrderSummary = {
  shopifyId: number;
  orderNumber: string;
  createdAt: string;
  revenue: number;
  currency: string;
  itemCount: number;
  profit: number | null;
  channel: SalesChannel;
  tags: string | null;
};

export type CustomerSummary = {
  id: string;
  customerKey: string;
  displayName: string;
  ebayUsername: string | null;
  primaryChannel: SalesChannel;
  orderCount: number;
  totalSpend: number;
  totalProfit: number | null;
  currency: string;
  isRepeatCustomer: boolean;
  lastOrderAt: string;
  phone: string | null;
};

export type CustomerDetail = CustomerSummary & {
  orders: CustomerOrderSummary[];
};

function normalizeBuyerKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable key for grouping orders by the same buyer. */
export function getCustomerKey(order: StoredOrder): string | null {
  const channel = getSalesChannel(order.tags);
  const ebayUsername = resolveEbayUsername(order);

  if (channel === "eBay" && ebayUsername) {
    return `ebay:${normalizeEbayUsername(ebayUsername)}`;
  }

  const buyerName = order.buyerName?.trim();
  if (buyerName && !isPlaceholderBuyerName(buyerName)) {
    return `buyer:${normalizeBuyerKey(buyerName)}`;
  }

  return null;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeCustomerId(customerKey: string): string {
  return bytesToBase64Url(new TextEncoder().encode(customerKey));
}

export function decodeCustomerId(customerId: string): string | null {
  const bytes = base64UrlToBytes(customerId);
  if (!bytes) {
    return null;
  }

  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function displayNameForOrder(order: StoredOrder): string {
  const ebayUsername = resolveEbayUsername(order);
  if (ebayUsername) {
    return (
      extractEbayDisplayName(order.buyerName) ??
      (isPlaceholderBuyerName(order.buyerName) ? ebayUsername : null) ??
      ebayUsername
    );
  }

  if (isPlaceholderBuyerName(order.buyerName)) {
    return "Unknown customer";
  }

  return order.buyerName?.trim() || "Unknown customer";
}

function toOrderSummary(order: StoredOrder): CustomerOrderSummary {
  return {
    shopifyId: order.shopifyId,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    revenue: order.revenue,
    currency: order.currency,
    itemCount: order.itemCount,
    profit: order.profit,
    channel: getSalesChannel(order.tags),
    tags: order.tags,
  };
}

function buildCustomerFromOrders(
  customerKey: string,
  orders: StoredOrder[],
): CustomerDetail {
  const sorted = [...orders].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const latest = sorted[0]!;
  const ebayUsername = resolveEbayUsername(latest);
  const channelCounts = new Map<SalesChannel, number>();

  for (const order of sorted) {
    const channel = getSalesChannel(order.tags);
    channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
  }

  const primaryChannel = [...channelCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0]![0];

  const currency = latest.currency;
  const totalSpend = sorted.reduce((sum, order) => sum + order.revenue, 0);
  const profits = sorted
    .map((order) => order.profit)
    .filter((value): value is number => value != null);
  const totalProfit =
    profits.length > 0 ? profits.reduce((sum, value) => sum + value, 0) : null;
  const phone =
    sorted
      .map((order) => order.shippingAddress?.phone?.trim())
      .find(Boolean) ?? null;

  return {
    id: encodeCustomerId(customerKey),
    customerKey,
    displayName: displayNameForOrder(latest),
    ebayUsername,
    primaryChannel,
    orderCount: sorted.length,
    totalSpend,
    totalProfit,
    currency,
    isRepeatCustomer: sorted.length > 1,
    lastOrderAt: latest.createdAt,
    phone,
    orders: sorted.map(toOrderSummary),
  };
}

export function aggregateCustomers(orders: StoredOrder[]): CustomerSummary[] {
  const byKey = new Map<string, StoredOrder[]>();

  for (const order of orders) {
    const key = getCustomerKey(order);
    if (!key) {
      continue;
    }

    const list = byKey.get(key) ?? [];
    list.push(order);
    byKey.set(key, list);
  }

  return [...byKey.entries()]
    .map(([key, customerOrders]) => buildCustomerFromOrders(key, customerOrders))
    .sort(
      (a, b) =>
        b.orderCount - a.orderCount ||
        b.totalSpend - a.totalSpend ||
        b.lastOrderAt.localeCompare(a.lastOrderAt),
    );
}

export function getCustomerDetail(
  orders: StoredOrder[],
  customerId: string,
): CustomerDetail | null {
  const customerKey = decodeCustomerId(customerId);
  if (!customerKey) {
    return null;
  }

  const customerOrders = orders.filter(
    (order) => getCustomerKey(order) === customerKey,
  );

  if (!customerOrders.length) {
    return null;
  }

  return buildCustomerFromOrders(customerKey, customerOrders);
}

export function customerHref(customerId: string): string {
  return `/customers/${customerId}`;
}

export function filterCustomersBySearch(
  customers: CustomerSummary[],
  orders: StoredOrder[],
  query: string,
): CustomerSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return customers;
  }

  const normalizedNeedle = needle.replace(/^#/, "");
  const orderNumbersByKey = new Map<string, string[]>();

  for (const order of orders) {
    const key = getCustomerKey(order);
    if (!key) {
      continue;
    }

    const list = orderNumbersByKey.get(key) ?? [];
    list.push(order.orderNumber.toLowerCase());
    orderNumbersByKey.set(key, list);
  }

  return customers.filter((customer) => {
    if (customer.displayName.toLowerCase().includes(needle)) {
      return true;
    }

    if (customer.ebayUsername?.toLowerCase().includes(needle)) {
      return true;
    }

    const orderNumbers = orderNumbersByKey.get(customer.customerKey) ?? [];
    return orderNumbers.some((orderNumber) => {
      const normalized = orderNumber.replace(/^#/, "");
      return (
        orderNumber.includes(needle) || normalized.includes(normalizedNeedle)
      );
    });
  });
}
