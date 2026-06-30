import type { StoredOrder } from "@/lib/orders/types";

/** Common variant label for quick filter on the orders page. */
export const EPOXY_BLACK_12_INCH_VARIANT = "[12 inch,Epoxy Black]";

export function parseProductFilter(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function filterOrdersByProductTitle(
  orders: StoredOrder[],
  productQuery: string | null,
): StoredOrder[] {
  if (!productQuery) {
    return orders;
  }

  const needle = productQuery.toLowerCase();

  return orders.filter((order) =>
    order.lineItems.some((item) => item.title.toLowerCase().includes(needle)),
  );
}

export function getMatchingLineItems(
  order: StoredOrder,
  productQuery: string,
): StoredOrder["lineItems"] {
  const needle = productQuery.toLowerCase();

  return order.lineItems.filter((item) =>
    item.title.toLowerCase().includes(needle),
  );
}

export function formatProductFilterLabel(productQuery: string): string {
  return `Product: ${productQuery}`;
}

export function getOrderProductDisplay(
  order: StoredOrder,
  productFilter?: string | null,
): {
  primary: string | null;
  extraCount: number;
  allTitles: string[];
} {
  const items = productFilter?.trim()
    ? getMatchingLineItems(order, productFilter)
    : order.lineItems;

  if (!items.length) {
    return { primary: null, extraCount: 0, allTitles: [] };
  }

  return {
    primary: items[0].title,
    extraCount: items.length - 1,
    allTitles: items.map((item) => item.title),
  };
}
