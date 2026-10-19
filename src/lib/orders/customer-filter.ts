import { resolveEbayUsername } from "@/lib/orders/ebay-buyer";
import type { StoredOrder } from "@/lib/orders/types";

export function parseCustomerFilter(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function filterOrdersByCustomer(
  orders: StoredOrder[],
  customerQuery: string | null,
): StoredOrder[] {
  if (!customerQuery) {
    return orders;
  }

  const needle = customerQuery.toLowerCase();

  return orders.filter((order) => {
    const buyerName = order.buyerName?.toLowerCase() ?? "";
    const ebayUsername = resolveEbayUsername(order)?.toLowerCase() ?? "";
    return buyerName.includes(needle) || ebayUsername.includes(needle);
  });
}

export function formatCustomerFilterLabel(customerQuery: string): string {
  return `Customer: ${customerQuery}`;
}
