import {
  extractEbayDisplayName,
  normalizeEbayUsername,
  resolveEbayUsername,
} from "@/lib/orders/ebay-buyer";
import { getStoredOrders } from "@/lib/orders/store";
import type { StoredOrder } from "@/lib/orders/types";

export type CustomerOrderSummary = {
  shopifyId: number;
  orderNumber: string;
  createdAt: string;
  revenue: number;
  currency: string;
  itemCount: number;
  profit: number | null;
  isCurrent: boolean;
};

/** eBay usernames with more than one order in the given list. */
export function getRepeatEbayCustomerUsernames(
  orders: StoredOrder[],
): string[] {
  const counts = new Map<string, number>();

  for (const order of orders) {
    const username = resolveEbayUsername(order);
    if (!username) {
      continue;
    }

    const key = normalizeEbayUsername(username);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([username]) => username);
}

export type CustomerHistory = {
  ebayUsername: string;
  displayName: string | null;
  orderCount: number;
  totalSpend: number;
  totalProfit: number | null;
  currency: string;
  isRepeatCustomer: boolean;
  orders: CustomerOrderSummary[];
};

function toSummary(order: StoredOrder, currentShopifyId: number): CustomerOrderSummary {
  return {
    shopifyId: order.shopifyId,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    revenue: order.revenue,
    currency: order.currency,
    itemCount: order.itemCount,
    profit: order.profit,
    isCurrent: order.shopifyId === currentShopifyId,
  };
}

export async function getEbayCustomerHistory(
  order: StoredOrder,
): Promise<CustomerHistory | null> {
  const username = resolveEbayUsername(order);
  if (!username) {
    return null;
  }

  const normalized = normalizeEbayUsername(username);
  const database = await getStoredOrders();

  const buyerOrders = database.orders
    .filter((candidate) => {
      const candidateUsername = resolveEbayUsername(candidate);
      return (
        candidateUsername != null &&
        normalizeEbayUsername(candidateUsername) === normalized
      );
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  if (!buyerOrders.length) {
    return null;
  }

  const currency = order.currency;
  const totalSpend = buyerOrders.reduce((sum, item) => sum + item.revenue, 0);
  const profits = buyerOrders
    .map((item) => item.profit)
    .filter((value): value is number => value != null);
  const totalProfit =
    profits.length > 0 ? profits.reduce((sum, value) => sum + value, 0) : null;

  const displayName =
    extractEbayDisplayName(order.buyerName) ??
    extractEbayDisplayName(buyerOrders[0]?.buyerName);

  return {
    ebayUsername: username,
    displayName,
    orderCount: buyerOrders.length,
    totalSpend,
    totalProfit,
    currency,
    isRepeatCustomer: buyerOrders.length > 1,
    orders: buyerOrders.map((item) => toSummary(item, order.shopifyId)),
  };
}
